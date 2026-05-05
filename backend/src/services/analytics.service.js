import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Customer from '../models/customer.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import Conversation from '../models/conversation.model.js';
import Followup from '../models/followup.model.js';
import moment from 'moment';

import { FinancialYear } from '../models/financialYear.model.js';

/**
 * Get Sales & Marketing Dashboard Analytics
 * @param {Object} filters
 * @param {Object} user - Logged in user for access control
 * @returns {Promise<Object>}
 */
const getSalesMarketingAnalytics = async (filters, user) => {
    const { fromDate, toDate, salesperson, source, product, fy } = filters;

    // Normalize dates
    let rangeStart = fromDate ? moment(fromDate).startOf('day').toDate() : moment().subtract(30, 'days').startOf('day').toDate();
    let rangeEnd = toDate ? moment(toDate).endOf('day').toDate() : moment().endOf('day').toDate();

    if (fy) {
        const fyData = await FinancialYear.findById(fy);
        if (fyData) {
            if (!rangeStart || rangeStart < fyData.startDate) rangeStart = fyData.startDate;
            if (!rangeEnd || rangeEnd > fyData.endDate) rangeEnd = fyData.endDate;
        }
    }

    // Security & Filters
    const isAdmin = ['admin', 'superadmin'].includes(user.role?.toLowerCase());
    const customerFilter = { isDeleted: { $ne: true } };
    if (!isAdmin) {
        customerFilter.assignedSalesperson = new mongoose.Types.ObjectId(user._id);
    } else if (salesperson) {
        customerFilter.assignedSalesperson = new mongoose.Types.ObjectId(salesperson);
    }
    if (source) customerFilter.leadSource = source;
    if (product) customerFilter.interestedProducts = { $in: [product] };

    // 1. Get Matching Customer IDs
    const matchingCustomers = await Customer.find(customerFilter, { _id: 1 }).lean();
    const customerIds = matchingCustomers.map(c => c._id);

    // 2. Fetch Metrics in Parallel
    const [
        leadsCount,
        contactedCount,
        qualifiedCount,
        invoicesData,
        ordersData,
        lostCount,
        overdueCount,
        trendsData,
        sourceWise,
        salespersonWise
    ] = await Promise.all([
        Customer.countDocuments({ 
            _id: { $in: customerIds }, 
            status: 'lead', 
            leadDate: { $gte: rangeStart, $lte: rangeEnd } 
        }),
        Conversation.distinct('customerId', {
            customerId: { $in: customerIds },
            createdAt: { $gte: rangeStart, $lte: rangeEnd }
        }).then(res => res.length),
        Promise.all([
            SalesOrder.distinct('customerId', { customerId: { $in: customerIds }, soDate: { $gte: rangeStart, $lte: rangeEnd } }),
            SalesInvoice.distinct('customerId', { customerId: { $in: customerIds }, invoiceDate: { $gte: rangeStart, $lte: rangeEnd } })
        ]).then(([so, si]) => new Set([...so, ...si]).size),
        SalesInvoice.aggregate([
            { $match: { customerId: { $in: customerIds }, isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }, invoiceDate: { $gte: rangeStart, $lte: rangeEnd } } },
            { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$grandTotal' } } }
        ]).then(res => res[0] || { count: 0, value: 0 }),
        SalesOrder.aggregate([
            { $match: { customerId: { $in: customerIds }, isDeleted: { $ne: true }, soDate: { $gte: rangeStart, $lte: rangeEnd } } },
            { 
                $group: { 
                    _id: null, 
                    totalOrders: { $sum: { $cond: [{ $ne: ['$orderCategory', 'Sample'] }, 1, 0] } },
                    totalSamples: { $sum: { $cond: [{ $eq: ['$orderCategory', 'Sample'] }, 1, 0] } },
                    sampleToSoCount: { $sum: { $cond: [{ $and: [{ $eq: ['$orderCategory', 'Sample'] }, { $ne: ['$invoiceId', null] }] }, 1, 0] } }
                } 
            }
        ]).then(res => res[0] || { totalOrders: 0, totalSamples: 0, sampleToSoCount: 0 }),
        Customer.countDocuments({ 
            _id: { $in: customerIds }, 
            leadStage: 'Lost', 
            updatedAt: { $gte: rangeStart, $lte: rangeEnd }
        }),
        Followup.countDocuments({
            customerId: { $in: customerIds },
            isClosed: false,
            reminderDate: { $lt: new Date() }
        }),
        Promise.all([
            Customer.aggregate([
                { $match: { _id: { $in: customerIds }, status: 'lead', leadDate: { $gte: rangeStart, $lte: rangeEnd } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$leadDate' } }, count: { $sum: 1 } } }
            ]),
            SalesInvoice.aggregate([
                { $match: { customerId: { $in: customerIds }, isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }, invoiceDate: { $gte: rangeStart, $lte: rangeEnd } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } }, value: { $sum: '$grandTotal' } } }
            ])
        ]).then(([leads, sales]) => {
            const map = {};
            leads.forEach(l => map[l._id] = { leads: l.count, salesValue: 0 });
            sales.forEach(s => {
                if (!map[s._id]) map[s._id] = { leads: 0, salesValue: 0 };
                map[s._id].salesValue = s.value;
            });
            return Object.keys(map).sort().map(k => ({ _id: k, ...map[k] }));
        }),
        Customer.aggregate([
            { $match: { _id: { $in: customerIds }, status: 'lead', leadDate: { $gte: rangeStart, $lte: rangeEnd } } },
            { $group: { _id: { $ifNull: ['$leadSource', 'Unknown'] }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]),
        SalesInvoice.aggregate([
            { $match: { customerId: { $in: customerIds }, isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }, invoiceDate: { $gte: rangeStart, $lte: rangeEnd } } },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: '$customer' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'customer.assignedSalesperson',
                    foreignField: '_id',
                    as: 'salesperson'
                }
            },
            { $unwind: { path: '$salesperson', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ['$salesperson.name', 'Unassigned'] },
                    salesValue: { $sum: '$grandTotal' },
                    invoices: { $sum: 1 }
                }
            },
            { $sort: { salesValue: -1 } }
        ])
    ]);

    // Lead-to-Cash Cycle Calculation
    const cycleData = await Customer.aggregate([
        { $match: { _id: { $in: customerIds }, leadDate: { $exists: true } } },
        {
            $lookup: {
                from: 'salesinvoices',
                let: { cid: '$_id' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$customerId', '$$cid'] }, isDeleted: { $ne: true } } },
                    { $sort: { invoiceDate: 1 } },
                    { $limit: 1 }
                ],
                as: 'firstInvoice'
            }
        },
        { $unwind: '$firstInvoice' },
        {
            $project: {
                diff: { $divide: [{ $subtract: ['$firstInvoice.invoiceDate', '$leadDate'] }, 1000 * 60 * 60 * 24] }
            }
        },
        { $group: { _id: null, avg: { $avg: '$diff' }, count: { $sum: 1 } } }
    ]);

    const leadToCashDays = (cycleData[0] && typeof cycleData[0].avg === 'number') ? cycleData[0].avg.toFixed(1) : 0;
    const conversionRate = leadsCount > 0 ? ((invoicesData.count / leadsCount) * 100).toFixed(1) : 0;
    const sampleToSoRate = ordersData.totalSamples > 0 ? ((ordersData.sampleToSoCount / ordersData.totalSamples) * 100).toFixed(1) : 0;

    return {
        summary: {
            totalLeads: leadsCount,
            contacted: contactedCount,
            qualified: qualifiedCount,
            samples: ordersData.totalSamples,
            orders: ordersData.totalOrders,
            invoices: invoicesData.count,
            salesValue: invoicesData.value,
            leadToCashDays,
            conversionRate,
            sampleToSoRate,
            lostLeads: lostCount,
            overdueFollowups: overdueCount
        },
        trends: trendsData,
        salespersonPerformance: salespersonWise,
        sourceDistribution: sourceWise,
        lostAnalysis: [],
        followupAnalysis: []
    };
};
/**
 * Query detailed lead report with pagination
 */
const queryLeadReport = async (filter, options) => {
    const { fromDate, toDate, salesperson, source, product, stage } = filter;
    
    // Build match
    const match = { isDeleted: { $ne: true }, status: 'lead' };
    if (fromDate || toDate) {
        match.createdAt = {};
        if (fromDate) match.createdAt.$gte = new Date(fromDate);
        if (toDate) match.createdAt.$lte = new Date(toDate);
    }
    if (salesperson) match.assignedSalesperson = new mongoose.Types.ObjectId(salesperson);
    if (source) match.leadSource = source;
    if (product) match.interestedProducts = { $in: [product] };
    if (stage) match.leadStage = stage;

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const results = await Customer.find(match)
        .populate('assignedSalesperson', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const totalResults = await Customer.countDocuments(match);
    const totalPages = Math.ceil(totalResults / limit);

    return {
        results,
        page,
        limit,
        totalPages,
        totalResults,
    };
};

/**
 * Export Sales & Marketing Analytics to Excel
 */
const exportSalesMarketingAnalytics = async (filters) => {
    const data = await getSalesMarketingAnalytics(filters);
    const { summary, sourceWise, salespersonWise, lostAnalysis } = data;

    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Summary Dashboard
    const summarySheet = workbook.addWorksheet('Dashboard Summary');
    summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
    ];
    summarySheet.addRows([
        { metric: 'Total Leads Generated', value: summary.totalLeads },
        { metric: 'Contacted Leads', value: summary.contactedLeads },
        { metric: 'Qualified Leads', value: summary.qualifiedLeads },
        { metric: 'Samples Issued', value: summary.samplesIssued },
        { metric: 'Orders Received', value: summary.ordersReceived },
        { metric: 'Invoices Generated', value: summary.invoicesGenerated },
        { metric: 'Converted Leads', value: summary.convertedLeads },
        { metric: 'Total Sales Value', value: summary.totalSalesValue },
        { metric: 'Lead to Order (Avg Days)', value: summary.avgLeadToOrderDays },
        { metric: 'Lost Leads', value: summary.lostLeads },
        { metric: 'Overdue Follow-ups', value: summary.overdueFollowups }
    ]);

    // Sheet 2: Source Analysis
    const sourceSheet = workbook.addWorksheet('Source Performance');
    sourceSheet.columns = [
        { header: 'Lead Source', key: '_id', width: 20 },
        { header: 'Leads', key: 'leads', width: 15 },
        { header: 'Converted', key: 'converted', width: 15 },
        { header: 'Sales Value', key: 'salesValue', width: 20 }
    ];
    sourceSheet.addRows(sourceWise);

    // Sheet 3: Salesperson Performance
    const spSheet = workbook.addWorksheet('Sales Team Performance');
    spSheet.columns = [
        { header: 'Salesperson', key: 'name', width: 20 },
        { header: 'Leads Assigned', key: 'leads', width: 15 },
        { header: 'Follow-ups Done', key: 'followups', width: 15 },
        { header: 'Samples Issued', key: 'samples', width: 15 },
        { header: 'Conversions', key: 'conversions', width: 15 },
        { header: 'Sales Value', key: 'salesValue', width: 20 }
    ];
    spSheet.addRows(salespersonWise);

    // Sheet 4: Lost Reason Analysis
    const lostSheet = workbook.addWorksheet('Lost Lead Analysis');
    lostSheet.columns = [
        { header: 'Reason', key: '_id', width: 30 },
        { header: 'Count', key: 'count', width: 15 }
    ];
    lostSheet.addRows(lostAnalysis);

    return await workbook.xlsx.writeBuffer();
};

export default {
    getSalesMarketingAnalytics,
    queryLeadReport,
    exportSalesMarketingAnalytics,
};
