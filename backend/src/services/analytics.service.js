import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Customer from '../models/customer.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import Conversation from '../models/conversation.model.js';
import Followup from '../models/followup.model.js';
import moment from 'moment';

/**
 * Get Sales & Marketing Dashboard Analytics
 * @param {Object} filters
 * @returns {Promise<Object>}
 */
const getSalesMarketingAnalytics = async (filters) => {
    const { fromDate, toDate, salesperson, source, product } = filters;

    // 1. Build Base Match for Customers/Leads
    const customerMatch = { isDeleted: { $ne: true } };
    if (fromDate || toDate) {
        customerMatch.createdAt = {};
        if (fromDate) customerMatch.createdAt.$gte = new Date(fromDate);
        if (toDate) customerMatch.createdAt.$lte = new Date(toDate);
    }
    if (salesperson) customerMatch.assignedSalesperson = new mongoose.Types.ObjectId(salesperson);
    if (source) customerMatch.leadSource = source;
    if (product) customerMatch.interestedProducts = { $in: [product] };

    // 2. Aggregate Funnel & KPI Data
    // Using $lookup to cross-reference multiple collections
    const analytics = await Customer.aggregate([
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
            $project: {
                _id: 1,
                customerName: 1,
                leadSource: 1,
                leadStage: 1,
                assignedSalesperson: 1,
                interestedProducts: 1,
                lostReason: 1,
                createdAt: 1,
                leadDate: 1,
                
                // Indicators based on business records
                hasConversation: { $gt: [{ $size: '$conversations' }, 0] },
                hasSample: {
                    $gt: [
                        {
                            $size: {
                                $filter: {
                                    input: '$orders',
                                    as: 'order',
                                    cond: { $eq: ['$$order.orderCategory', 'Sample'] }
                                }
                            }
                        },
                        0
                    ]
                },
                hasOrder: {
                    $gt: [
                        {
                            $size: {
                                $filter: {
                                    input: '$orders',
                                    as: 'order',
                                    cond: { $ne: ['$$order.orderCategory', 'Sample'] }
                                }
                            }
                        },
                        0
                    ]
                },
                hasInvoice: { $gt: [{ $size: '$invoices' }, 0] },
                
                // Final sales value from invoices
                salesValue: { $sum: '$invoices.grandTotal' },
                
                // Overdue reminders
                overdueCount: {
                    $size: {
                        $filter: {
                            input: '$reminders',
                            as: 'r',
                            cond: { 
                                $and: [
                                    { $eq: ['$$r.isClosed', false] },
                                    { $lt: ['$$r.reminderDate', new Date()] }
                                ]
                            }
                        }
                    }
                },
                
                // Lead Aging (Days from creation to first conversion)
                firstOrderDate: { $min: '$orders.soDate' }
            }
        },
        {
            // Business Logic Layer: Determine stages based on Rule Priority
            $project: {
                _id: 1,
                leadSource: 1,
                leadStage: 1,
                lostReason: 1,
                salesValue: 1,
                assignedSalesperson: 1,
                overdueCount: 1,
                interestedProducts: 1,
                createdAt: 1,
                
                isContacted: { $or: ['$hasConversation', { $in: ['$leadStage', ['Contacted', 'Qualified', 'Converted']] }] },
                isQualified: { $or: [{ $eq: ['$leadStage', 'Qualified'] }, '$hasSample', '$hasOrder', '$hasInvoice'] },
                isSampled: '$hasSample',
                isOrdered: '$hasOrder',
                isInvoiced: '$hasInvoice',
                isConverted: { $or: ['$hasOrder', '$hasInvoice', { $eq: ['$leadStage', 'Converted'] }] },
                
                leadToOrderDays: {
                    $cond: [
                        { $and: ['$firstOrderDate', '$leadDate'] },
                        { $divide: [{ $subtract: ['$firstOrderDate', '$leadDate'] }, 1000 * 60 * 60 * 24] },
                        null
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                totalLeads: { $sum: 1 },
                contactedLeads: { $sum: { $cond: ['$isContacted', 1, 0] } },
                qualifiedLeads: { $sum: { $cond: ['$isQualified', 1, 0] } },
                samplesIssued: { $sum: { $cond: ['$isSampled', 1, 0] } },
                ordersReceived: { $sum: { $cond: ['$isOrdered', 1, 0] } },
                invoicesGenerated: { $sum: { $cond: ['$isInvoiced', 1, 0] } },
                convertedLeads: { $sum: { $cond: ['$isConverted', 1, 0] } },
                totalSalesValue: { $sum: '$salesValue' },
                overdueFollowups: { $sum: '$overdueCount' },
                lostLeads: { $sum: { $cond: [{ $eq: ['$leadStage', 'Lost'] }, 1, 0] } },
                totalLeadToOrderDays: { $sum: '$leadToOrderDays' },
                agingCount: { $sum: { $cond: ['$leadToOrderDays', 1, 0] } }
            }
        }
    ]);

    const summary = analytics[0] || {
        totalLeads: 0, contactedLeads: 0, qualifiedLeads: 0, samplesIssued: 0,
        ordersReceived: 0, invoicesGenerated: 0, convertedLeads: 0, totalSalesValue: 0,
        overdueFollowups: 0, lostLeads: 0, avgLeadToOrderDays: 0
    };
    
    // Supplement summary with averages
    summary.avgLeadToOrderDays = summary.agingCount > 0 ? (summary.totalLeadToOrderDays / summary.agingCount).toFixed(1) : 0;

    // 3. Source-wise Distribution (Enhanced with Conversion & Sales)
    const sourceWise = await Customer.aggregate([
        { $match: customerMatch },
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
            $project: {
                leadSource: { $ifNull: ['$leadSource', 'Unknown'] },
                isConverted: { 
                    $gt: [
                        { $size: { $filter: { input: '$orders', as: 'o', cond: { $ne: ['$$o.orderCategory', 'Sample'] } } } }, 
                        0 
                    ] 
                },
                totalValue: { $sum: '$invoices.grandTotal' }
            }
        },
        {
            $group: {
                _id: '$leadSource',
                leads: { $sum: 1 },
                converted: { $sum: { $cond: ['$isConverted', 1, 0] } },
                salesValue: { $sum: '$totalValue' }
            }
        },
        { $sort: { leads: -1 } }
    ]);

    // 4. Salesperson-wise Detailed Performance
    const salespersonWise = await Customer.aggregate([
        { $match: customerMatch },
        {
            $lookup: {
                from: 'users',
                localField: 'assignedSalesperson',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
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
            $project: {
                assignedSalesperson: 1,
                name: { $ifNull: ['$user.name', 'Unassigned'] },
                hasConversation: { $gt: [{ $size: '$conversations' }, 0] },
                hasSample: { $gt: [{ $size: { $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.orderCategory', 'Sample'] } } } }, 0] },
                isConverted: { $gt: [{ $size: { $filter: { input: '$orders', as: 'o', cond: { $ne: ['$$o.orderCategory', 'Sample'] } } } }, 0] },
                salesValue: { $sum: '$invoices.grandTotal' }
            }
        },
        {
            $group: {
                _id: '$assignedSalesperson',
                name: { $first: '$name' },
                leads: { $sum: 1 },
                followups: { $sum: { $cond: ['$hasConversation', 1, 0] } },
                samples: { $sum: { $cond: ['$hasSample', 1, 0] } },
                conversions: { $sum: { $cond: ['$isConverted', 1, 0] } },
                salesValue: { $sum: '$salesValue' }
            }
        },
        { $sort: { salesValue: -1 } }
    ]);

    // 5. Product-wise Analysis (intent from Customer interestedProducts)
    // Business Rule: intent from profile, sales from actual documents
    const productIntent = await Customer.aggregate([
        { $match: { ...customerMatch, interestedProducts: { $exists: true, $not: { $size: 0 } } } },
        { $unwind: '$interestedProducts' },
        {
            $group: {
                _id: '$interestedProducts',
                inquiries: { $sum: 1 }
            }
        },
        { $sort: { inquiries: -1 } }
    ]);

    // 6. Lost Lead Analysis
    const lostAnalysis = await Customer.aggregate([
        { $match: { ...customerMatch, leadStage: 'Lost' } },
        {
            $group: {
                _id: { $ifNull: ['$lostReason', 'Not Specified'] },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    // 7. Trend Analysis
    const trend = await Customer.aggregate([
        { $match: customerMatch },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                leads: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        summary,
        sourceWise,
        salespersonWise,
        productIntent,
        lostAnalysis,
        trend
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
