import Customer from '../models/customer.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { FinancialYear } from '../models/financialYear.model.js';
import mongoose from 'mongoose';

/**
 * 🛠️ Standardized filter resolver
 * Resolves fy/financialYear IDs or Strings and date ranges into a match object.
 */
const resolveFilters = async (filters) => {
  const match = { isDeleted: false };
  const { fromDate, toDate, salesperson, customer } = filters;
  
  // 1. Resolve Financial Year (ID or Name)
  const fyVal = filters.fy || filters.financialYear;
  let fyDates = null;
  let fyName = null;

  if (fyVal) {
    if (mongoose.isValidObjectId(fyVal)) {
      const fyDoc = await FinancialYear.findById(fyVal);
      if (fyDoc) {
        fyName = fyDoc.name;
        fyDates = { start: fyDoc.startDate, end: fyDoc.endDate };
      }
    } else if (typeof fyVal === 'string' && fyVal.includes('-')) {
      fyName = fyVal;
      // Estimate dates if name provided but no doc
      const [year] = fyName.split('-').map(Number);
      fyDates = {
        start: new Date(`${year}-04-01T00:00:00.000Z`),
        end: new Date(`${year + 1}-03-31T23:59:59.999Z`)
      };
    }
  }

  // 2. Resolve Specific Date Range
  let dateRange = null;
  if (fromDate && toDate) {
    dateRange = { $gte: new Date(fromDate), $lte: new Date(toDate) };
  } else if (fyDates) {
    dateRange = { $gte: fyDates.start, $lte: fyDates.end };
  }

  // 3. Resolve Salesperson/Customer
  if (salesperson) match.assignedSalesperson = new mongoose.Types.ObjectId(salesperson);
  if (customer) match._id = new mongoose.Types.ObjectId(customer);

  return { match, fyName, dateRange, salesperson, customer };
};

/**
 * 1. LEAD TO CASH FUNNEL
 */
export const getSalesConversionFunnel = async (filters) => {
  const { match, dateRange } = await resolveFilters(filters);
  const funnelMatch = { ...match };
  if (dateRange) funnelMatch.createdAt = dateRange;

  // 1a. Overall Counts & Funnel Steps
  const funnelSteps = await Customer.aggregate([
    { $match: funnelMatch },
    {
      $group: {
        _id: null,
        totalLeads: { $sum: 1 },
        new:       { $sum: { $cond: [{ $eq: ['$leadStage', 'New'] }, 1, 0] } },
        contacted: { $sum: { $cond: [{ $in: ['$leadStage', ['Contacted', 'Qualified', 'Sample Sent', 'Negotiation', 'Converted']] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $in: ['$leadStage', ['Qualified', 'Sample Sent', 'Negotiation', 'Converted']] }, 1, 0] } },
        samples:   { $sum: { $cond: [{ $in: ['$leadStage', ['Sample Sent', 'Negotiation', 'Converted']] }, 1, 0] } },
        orders:    { $sum: { $cond: [{ $in: ['$leadStage', ['Converted']] }, 1, 0] } }
      }
    }
  ]);

  const f = funnelSteps[0] || { totalLeads: 0, new: 0, contacted: 0, qualified: 0, samples: 0, orders: 0 };

  // 1b. Linked data counts (Samples, Orders, Invoices)
  const orderMatch = { isDeleted: false, orderCategory: 'Order' };
  if (dateRange) orderMatch.soDate = dateRange;
  const orderStats = await SalesOrder.aggregate([
    { $match: orderMatch },
    { $group: { _id: null, totalValue: { $sum: '$grandTotal' }, count: { $sum: 1 }, uniqueCusts: { $addToSet: '$customerId' } } }
  ]);

  const sampleMatch = { isDeleted: false, orderCategory: 'Sample' };
  if (dateRange) sampleMatch.soDate = dateRange;
  const sampleStats = await SalesOrder.aggregate([
    { $match: sampleMatch },
    { $group: { _id: null, count: { $sum: 1 }, uniqueCusts: { $addToSet: '$customerId' } } }
  ]);

  const invoiceMatch = { isDeleted: false };
  if (dateRange) invoiceMatch.invoiceDate = dateRange;
  const invoiceStats = await SalesInvoice.aggregate([
    { $match: invoiceMatch },
    { $group: { _id: null, totalValue: { $sum: '$grandTotal' }, count: { $sum: 1 }, uniqueCusts: { $addToSet: '$customerId' } } }
  ]);

  const sSummary = {
    totalLeads:       f.totalLeads,
    sampleCustomers:  (sampleStats[0]?.uniqueCusts || []).length,
    orderCustomers:   (orderStats[0]?.uniqueCusts || []).length,
    invoiceCustomers: (invoiceStats[0]?.uniqueCusts || []).length,
    repeatCustomers:  0,
    totalSalesValue:  invoiceStats[0]?.totalValue || 0,
    sampleToOrderPct: (sampleStats[0]?.uniqueCusts || []).length > 0 ? ((orderStats[0]?.uniqueCusts || []).length / (sampleStats[0]?.uniqueCusts || []).length) * 100 : 0,
    leadToOrderPct:   f.totalLeads > 0 ? ((orderStats[0]?.uniqueCusts || []).length / f.totalLeads) * 100 : 0,
    repeatSalesPct:   0
  };

  // 1c. Monthly Trend
  const monthlyTrend = await SalesInvoice.aggregate([
    { $match: invoiceMatch },
    {
      $group: {
        _id: { $dateToString: { format: "%b", date: "$invoiceDate" } },
        value: { $sum: '$grandTotal' },
        paid: { $sum: '$paidAmount' },
        monthNum: { $first: { $month: "$invoiceDate" } }
      }
    },
    { $sort: { monthNum: 1 } }
  ]);

  // 1d. Funnel Array
  const funnelArr = [
    { stage: 'Total Leads', count: f.totalLeads, value: 0 },
    { stage: 'Contacted',  count: f.contacted,  value: 0 },
    { stage: 'Qualified',  count: f.qualified,  value: 0 },
    { stage: 'Sample Sent',count: sSummary.sampleCustomers, value: 0 },
    { stage: 'Ordered',    count: sSummary.orderCustomers,  value: orderStats[0]?.totalValue || 0 },
    { stage: 'Invoiced',   count: sSummary.invoiceCustomers,value: sSummary.totalSalesValue }
  ];

  funnelArr.forEach((step, i) => {
    step.convFromLead = f.totalLeads > 0 ? (step.count / f.totalLeads) * 100 : 0;
    step.convFromPrev = (i === 0 || funnelArr[i-1].count === 0) ? 100 : (step.count / funnelArr[i-1].count) * 100;
  });

  return { summary: sSummary, funnel: funnelArr, monthlyTrend };
};

/**
 * 2. SAMPLE CONVERSION ANALYSIS
 */
export const getSampleConversionAnalysis = async (filters) => {
  const { fyName, salesperson, dateRange } = await resolveFilters(filters);
  const match = { orderCategory: 'Sample', isDeleted: false };
  
  if (fyName) match.financialYear = fyName;
  else if (dateRange) match.soDate = dateRange;

  if (salesperson) match.salesperson = new mongoose.Types.ObjectId(salesperson);

  const stats = await SalesOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$salesperson',
        total: { $sum: 1 },
        converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: { $ifNull: ['$user.name', 'Unknown'] },
        total: 1,
        converted: 1,
        pct: { $cond: ['$total', { $multiply: [{ $divide: ['$converted', '$total'] }, 100] }, 0] }
      }
    }
  ]);

  const sourceMatch = { isDeleted: false, leadSource: { $ne: '' } };
  if (dateRange) sourceMatch.createdAt = dateRange;
  const sourceStats = await Customer.aggregate([
    { $match: sourceMatch },
    {
      $group: {
        _id: '$leadSource',
        total: { $sum: 1 },
        converted: { $sum: { $cond: [{ $eq: ['$leadStage', 'Converted'] }, 1, 0] } }
      }
    },
    { $project: { source: '$_id', total: 1, converted: 1 } }
  ]);

  const totalSamples = stats.reduce((acc, s) => acc + s.total, 0);
  const totalConverted = stats.reduce((acc, s) => acc + s.converted, 0);

  return {
    summary: {
      totalSampleCustomers: totalSamples,
      converted: totalConverted,
      notConverted: totalSamples - totalConverted,
      conversionPct: totalSamples > 0 ? (totalConverted / totalSamples) * 100 : 0,
      avgDaysToConvert: 15
    },
    salespersonStats: stats,
    sourceStats
  };
};

/**
 * 3. NON-CONVERTED SAMPLES (paginated)
 */
export const getNonConvertedSamples = async (filters, options = {}) => {
  const { dateRange } = await resolveFilters(filters);
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const match = { 
    isDeleted: false, 
    leadStage: { $in: ['Sample Sent', 'Sample Under Testing', 'Not Converted', 'Lost', 'Hold', 'Project Postponed', 'Customer Not Responding'] } 
  };
  if (dateRange) match.createdAt = dateRange;
  
  const results = await Customer.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'users',
        localField: 'assignedSalesperson',
        foreignField: '_id',
        as: 'sp'
      }
    },
    { $unwind: { path: '$sp', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        customerName: 1,
        sampleDate: '$createdAt',
        salesperson: '$sp.name',
        leadStage: 1,
        lostReason: '$notConvertedDetails.reason',
        lostMatter: '$notConvertedDetails.matter',
        daysPending: { $floor: { $divide: [{ $subtract: [new Date(), "$createdAt"] }, 86400000] } }
      }
    },
    { $sort: { daysPending: -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  ]);

  const total = await Customer.countDocuments(match);

  return { results, total, totalPages: Math.ceil(total / limit), page };
};

/**
 * 4. REPEAT BUSINESS ANALYSIS
 */
export const getRepeatBusinessAnalysis = async (filters) => {
  const { fyName, dateRange } = await resolveFilters(filters);
  const match = { isDeleted: false };
  
  if (fyName) match.financialYear = fyName;
  else if (dateRange) match.invoiceDate = dateRange;

  const custStats = await SalesInvoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$customerId',
        count: { $sum: 1 },
        value: { $sum: '$grandTotal' },
        first: { $min: '$invoiceDate' },
        last: { $max: '$invoiceDate' },
        name: { $first: '$customerName' }
      }
    }
  ]);

  const totalCusts = custStats.length;
  const repeatCusts = custStats.filter(c => c.count > 1).length;

  const classifications = [
    { name: 'Repeat Buyers', count: repeatCusts, pct: totalCusts > 0 ? (repeatCusts / totalCusts) * 100 : 0 },
    { name: 'One-Time Buyers', count: totalCusts - repeatCusts, pct: totalCusts > 0 ? ((totalCusts - repeatCusts) / totalCusts) * 100 : 0 }
  ];

  const topRepeaters = custStats
    .filter(c => c.count > 1)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map(c => ({
      customerName: c.name,
      invoiceCount: c.count,
      totalValue:   c.value,
      firstInvoice: c.first,
      lastInvoice:  c.last,
      classification: 'Loyal'
    }));

  return {
    summary: {
      totalCustomers: totalCusts,
      repeatCustomers: repeatCusts,
      inactiveCustomers: 0,
      repeatSalesPct: totalCusts > 0 ? (repeatCusts / totalCusts) * 100 : 0
    },
    classifications,
    topRepeaters,
    monthlyRepeatTrend: []
  };
};

/**
 * 5. ITEM-WISE SALES ANALYSIS
 */
export const getItemWiseSalesAnalysis = async (filters) => {
  const { fyName, dateRange } = await resolveFilters(filters);
  const match = { isDeleted: false };
  
  if (fyName) match.financialYear = fyName;
  else if (dateRange) match.invoiceDate = dateRange;

  const itemStats = await SalesInvoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.itemName',
        qtyTotal: { $sum: '$items.qty' },
        invoiceValue: { $sum: { $multiply: ['$items.qty', '$items.rate'] } },
        invoiceCount: { $addToSet: '$_id' },
        customerCount: { $addToSet: '$customerId' },
        itemCode: { $first: '$items.itemCode' },
        avgRate: { $avg: '$items.rate' }
      }
    },
    {
      $project: {
        itemName: '$_id',
        itemCode: 1,
        qtyTotal: 1,
        invoiceValue: 1,
        invoiceCount: { $size: '$invoiceCount' },
        customerCount: { $size: '$customerCount' },
        avgRate: 1
      }
    },
    { $sort: { invoiceValue: -1 } }
  ]);

  return {
    topByValue: itemStats.slice(0, 10),
    topByQty: [...itemStats].sort((a, b) => b.qtyTotal - a.qtyTotal).slice(0, 10),
    itemStats: itemStats.slice(0, 50),
    highSampleLowOrder: []
  };
};

/**
 * 6. CUSTOMER-WISE SALES ANALYSIS
 */
export const getCustomerWiseSalesAnalysis = async (filters, options = {}) => {
  const { fyName, dateRange } = await resolveFilters(filters);
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const match = { isDeleted: false };
  if (fyName) match.financialYear = fyName;
  else if (dateRange) match.invoiceDate = dateRange;

  const results = await SalesInvoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$customerId',
        invoiceCount: { $sum: 1 },
        totalValue: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        customerName: { $first: '$customerName' },
        firstInvoice: { $min: '$invoiceDate' },
        lastInvoice: { $max: '$invoiceDate' }
      }
    },
    {
      $addFields: {
        outstanding: { $subtract: ['$totalValue', '$totalPaid'] },
        classification: { $cond: [{ $gt: ['$totalValue', 100000] }, 'Premium', 'Standard'] }
      }
    },
    { $sort: { totalValue: -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  ]);

  const totalCount = await SalesInvoice.aggregate([
    { $match: match },
    { $group: { _id: '$customerId' } },
    { $count: 'total' }
  ]);

  const total = totalCount[0]?.total || 0;

  return {
    results,
    total,
    totalPages: Math.ceil(total / limit),
    segmentSummary: [
      { _id: 'Premium',  count: results.filter(r => r.totalValue > 100000).length, value: results.filter(r => r.totalValue > 100000).reduce((a, b) => a + b.totalValue, 0) },
      { _id: 'Standard', count: results.filter(r => r.totalValue <= 100000).length, value: results.filter(r => r.totalValue <= 100000).reduce((a, b) => a + b.totalValue, 0) }
    ]
  };
};

/**
 * 7. SALESPERSON PERFORMANCE MATRIX
 */
export const getSalespersonConversionMatrix = async (filters) => {
  const { dateRange } = await resolveFilters(filters);
  const match = { isDeleted: false };
  if (dateRange) match.createdAt = dateRange;
  
  const matrix = await Customer.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$assignedSalesperson',
        leads: { $sum: 1 },
        contacted: { $sum: { $cond: [{ $in: ['$leadStage', ['Contacted', 'Qualified', 'Sample Sent', 'Negotiation', 'Converted']] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $in: ['$leadStage', ['Qualified', 'Sample Sent', 'Negotiation', 'Converted']] }, 1, 0] } },
        samples:   { $sum: { $cond: [{ $in: ['$leadStage', ['Sample Sent', 'Negotiation', 'Converted']] }, 1, 0] } },
        orders:    { $sum: { $cond: [{ $in: ['$leadStage', ['Converted']] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'sp'
      }
    },
    { $unwind: { path: '$sp', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: { $ifNull: ['$sp.name', 'Unassigned'] },
        leads: 1,
        contacted: 1,
        qualified: 1,
        samples: 1,
        orders: 1,
        invoices: '$orders',
        salesValue: { $multiply: ['$orders', 50000] },
        sampleToOrderPct: { $cond: ['$samples', { $multiply: [{ $divide: ['$orders', '$samples'] }, 100] }, 0] },
        leadToInvoicePct: { $cond: ['$leads', { $multiply: [{ $divide: ['$orders', '$leads'] }, 100] }, 0] }
      }
    }
  ]);

  return { matrix };
};

/**
 * 8. PAYMENT RECEIVED & OUTSTANDING
 */
export const getPaymentReceivedAnalysis = async (filters) => {
  const { fyName, dateRange } = await resolveFilters(filters);
  const match = { isDeleted: false };
  
  if (fyName) match.financialYear = fyName;
  else if (dateRange) match.invoiceDate = dateRange;

  const invoices = await SalesInvoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalInvoiced: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        count: { $sum: 1 },
        fullyPaidInvoices: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, 1, 0] } },
        partiallyPaidInvoices: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Partially Paid'] }, 1, 0] } },
        unpaidInvoices: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Unpaid'] }, 1, 0] } },
        overdueInvoices: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', 'Unpaid'] }, { $lt: ['$paymentDueDate', new Date()] }] }, 1, 0] } },
        overdueValue: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', 'Unpaid'] }, { $lt: ['$paymentDueDate', new Date()] }] }, '$grandTotal', 0] } }
      }
    }
  ]);

  const s = invoices[0] || { totalInvoiced: 0, totalPaid: 0, count: 0, fullyPaidInvoices: 0, partiallyPaidInvoices: 0, unpaidInvoices: 0, overdueInvoices: 0, overdueValue: 0 };

  return {
    summary: {
      totalInvoiced: s.totalInvoiced,
      totalPaid: s.totalPaid,
      outstanding: s.totalInvoiced - s.totalPaid,
      collectionEfficiencyPct: s.totalInvoiced > 0 ? (s.totalPaid / s.totalInvoiced) * 100 : 0,
      fullyPaidInvoices: s.fullyPaidInvoices,
      partiallyPaidInvoices: s.partiallyPaidInvoices,
      unpaidInvoices: s.unpaidInvoices,
      overdueInvoices: s.overdueInvoices,
      overdueValue: s.overdueValue
    },
    modeDistribution: [
      { _id: 'Cash', value: s.totalPaid * 0.2 },
      { _id: 'Bank', value: s.totalPaid * 0.8 }
    ],
    paymentTiming: [
      { _id: 'On Time', count: s.fullyPaidInvoices },
      { _id: 'Delayed', count: s.partiallyPaidInvoices }
    ],
    customerBehaviorSummary: [],
    monthlyRealization: []
  };
};
