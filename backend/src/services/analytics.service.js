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

    // 1. Build Base Match for Customers/Leads
    const customerMatch = { isDeleted: { $ne: true }, status: 'lead' };
    
    // A. Financial Year logic
    let startDate = fromDate ? new Date(fromDate) : null;
    let endDate = toDate ? new Date(toDate) : null;

    if (fy) {
        const fyData = await FinancialYear.findById(fy);
        if (fyData) {
            if (!startDate || startDate < fyData.startDate) startDate = fyData.startDate;
            if (!endDate || endDate > fyData.endDate) endDate = fyData.endDate;
        }
    }

    if (startDate || endDate) {
        customerMatch.leadDate = {};
        if (startDate) customerMatch.leadDate.$gte = startDate;
        if (endDate) customerMatch.leadDate.$lte = endDate;
    }

    // B. Security / Role based filtering
    // Admin/SuperAdmin sees everything unless a specific salesperson is selected
    // Salesperson sees ONLY their data
    const isAdmin = ['admin', 'superadmin'].includes(user.role?.toLowerCase());
    if (!isAdmin) {
        customerMatch.assignedSalesperson = new mongoose.Types.ObjectId(user._id);
    } else if (salesperson) {
        customerMatch.assignedSalesperson = new mongoose.Types.ObjectId(salesperson);
    }

    if (source) customerMatch.leadSource = source;
    if (product) customerMatch.interestedProducts = { $in: [product] };

    // 2. Comprehensive Aggregation Pipeline
    const analyticsFacet = await Customer.aggregate([
        { $match: customerMatch },
        {
            $lookup: {
                from: 'conversations',
                localField: '_id',
                foreignField: 'customerId',
                as: 'conversations'
            }
        },
        {
            $lookup: {
                from: 'salesorders',
                localField: '_id',
                foreignField: 'customerId',
                as: 'orders'
            }
        },
        {
            $lookup: {
                from: 'salesinvoices',
                localField: '_id',
                foreignField: 'customerId',
                as: 'invoices'
            }
        },
        {
            $lookup: {
                from: 'reminders',
                localField: '_id',
                foreignField: 'customerId',
                as: 'reminders'
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'assignedSalesperson',
                foreignField: '_id',
                as: 'salespersonInfo'
            }
        },
        { $unwind: { path: '$salespersonInfo', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                customerName: 1,
                leadSource: 1,
                leadStage: 1,
                lostReason: 1,
                interestedProducts: 1,
                leadDate: 1,
                salespersonName: { $ifNull: ['$salespersonInfo.name', 'Unassigned'] },
                
                // Stage indicators
                hasFollowup: { $gt: [{ $size: '$conversations' }, 0] },
                hasSample: {
                    $gt: [{ $size: { $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.orderCategory', 'Sample'] } } } }, 0]
                },
                hasOrder: {
                    $gt: [{ $size: { $filter: { input: '$orders', as: 'o', cond: { $ne: ['$$o.orderCategory', 'Sample'] } } } }, 0]
                },
                hasInvoice: { $gt: [{ $size: '$invoices' }, 0] },
                
                // Values
                orderValue: { $sum: '$orders.grandTotal' },
                invoiceValue: { $sum: '$invoices.grandTotal' },
                
                // Calculation dates
                firstInvoiceDate: { $min: '$invoices.invoiceDate' },
                
                // Reminder status
                reminders: 1
            }
        },
        {
            $facet: {
                // KPI Summary
                summary: [
                    {
                        $group: {
                            _id: null,
                            totalLeads: { $sum: 1 },
                            contacted: { $sum: { $cond: [{ $or: ['$hasFollowup', '$hasSample', '$hasOrder', '$hasInvoice'] }, 1, 0] } },
                            qualified: { $sum: { $cond: [{ $or: ['$hasSample', '$hasOrder', '$hasInvoice'] }, 1, 0] } },
                            samples: { $sum: { $cond: ['$hasSample', 1, 0] } },
                            orders: { $sum: { $cond: ['$hasOrder', 1, 0] } },
                            invoices: { $sum: { $cond: ['$hasInvoice', 1, 0] } },
                            salesValue: { $sum: { $cond: [{ $gt: ['$invoiceValue', 0] }, '$invoiceValue', '$orderValue'] } },
                            totalLeadToCashDays: {
                                $sum: {
                                    $cond: [
                                        { $and: ['$firstInvoiceDate', '$leadDate'] },
                                        { $divide: [{ $subtract: ['$firstInvoiceDate', '$leadDate'] }, 1000 * 60 * 60 * 24] },
                                        0
                                    ]
                                }
                            },
                            cashCount: { $sum: { $cond: [{ $and: ['$firstInvoiceDate', '$leadDate'] }, 1, 0] } },
                            lostLeads: { $sum: { $cond: [{ $eq: ['$leadStage', 'Lost'] }, 1, 0] } },
                            sampleToSoCount: { 
                                $sum: { $cond: [{ $and: ['$hasSample', '$hasOrder'] }, 1, 0] } 
                            }
                        }
                    }
                ],
                // Lead & Sales Trends
                trends: [
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%d', date: '$leadDate' } },
                            leads: { $sum: 1 },
                            salesValue: { $sum: { $cond: [{ $gt: ['$invoiceValue', 0] }, '$invoiceValue', '$orderValue'] } }
                        }
                    },
                    { $sort: { _id: 1 } }
                ],
                // Salesperson Matrix
                salespersonPerformance: [
                    {
                        $group: {
                            _id: '$salespersonName',
                            leads: { $sum: 1 },
                            qualified: { $sum: { $cond: [{ $or: ['$hasSample', '$hasOrder', '$hasInvoice'] }, 1, 0] } },
                            orders: { $sum: { $cond: ['$hasOrder', 1, 0] } },
                            invoices: { $sum: { $cond: ['$hasInvoice', 1, 0] } },
                            salesValue: { $sum: { $cond: [{ $gt: ['$invoiceValue', 0] }, '$invoiceValue', '$orderValue'] } }
                        }
                    },
                    { $sort: { salesValue: -1 } }
                ],
                // Lead Source Analysis
                sourceDistribution: [
                    {
                        $group: {
                            _id: { $ifNull: ['$leadSource', 'Unknown'] },
                            count: { $sum: 1 },
                            sales: { $sum: { $cond: [{ $gt: ['$invoiceValue', 0] }, '$invoiceValue', '$orderValue'] } }
                        }
                    },
                    { $sort: { count: -1 } }
                ],
                // Lost Reason Analysis
                lostAnalysis: [
                    { $match: { leadStage: 'Lost' } },
                    {
                        $group: {
                            _id: { $ifNull: ['$lostReason', 'Other'] },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } }
                ],
                // Follow-up status analysis
                followupAnalysis: [
                    { $unwind: '$reminders' },
                    {
                        $group: {
                            _id: {
                                $cond: [
                                    { $eq: ['$reminders.isClosed', true] }, 'Completed',
                                    {
                                        $cond: [
                                            { $lt: ['$reminders.reminderDate', new Date()] }, 'Overdue',
                                            { 
                                                $cond: [
                                                    { $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$reminders.reminderDate' } }, { $dateToString: { format: '%Y-%m-%d', date: new Date() } }] }, 'Due Today',
                                                    'Pending'
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            },
                            count: { $sum: 1 }
                        }
                    }
                ],
                // Overdue Total KPI (Distinct leads with overdue)
                overdueTotal: [
                    { $unwind: '$reminders' },
                    { $match: { 'reminders.isClosed': false, 'reminders.reminderDate': { $lt: new Date() } } },
                    { $group: { _id: '$_id' } },
                    { $count: 'count' }
                ]
            }
        }
    ]);

    const result = analyticsFacet[0];
    const summaryData = result.summary[0] || {
        totalLeads: 0, contacted: 0, qualified: 0, samples: 0,
        orders: 0, invoices: 0, salesValue: 0, lostLeads: 0, totalLeadToCashDays: 0, cashCount: 0, sampleToSoCount: 0
    };

    // Lead-to-Cash Calculation
    const leadToCashDays = summaryData.cashCount > 0 ? (summaryData.totalLeadToCashDays / summaryData.cashCount).toFixed(1) : 0;
    const conversionRate = summaryData.totalLeads > 0 ? ((summaryData.invoices / summaryData.totalLeads) * 100).toFixed(1) : 0;
    const sampleToSoRate = summaryData.samples > 0 ? ((summaryData.sampleToSoCount / summaryData.samples) * 100).toFixed(1) : 0;

    return {
        summary: {
            ...summaryData,
            leadToCashDays,
            conversionRate,
            sampleToSoRate,
            overdueFollowups: result.overdueTotal[0]?.count || 0
        },
        trends: result.trends,
        salespersonPerformance: result.salespersonPerformance,
        sourceDistribution: result.sourceDistribution,
        lostAnalysis: result.lostAnalysis,
        followupAnalysis: result.followupAnalysis || []
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
