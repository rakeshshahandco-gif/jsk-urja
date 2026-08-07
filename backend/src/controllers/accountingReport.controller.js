import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Voucher } from '../models/voucher.model.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import Customer from '../models/customer.model.js';
import moment from 'moment';
import * as gpAnalysis from '../services/gpAnalysis.service.js';
import { getCashFlowStatement } from '../services/cashFlow.service.js';
import { getLedgerBalancesByEntryGroup } from '../services/masterAlteration/ledgerBalanceByGroup.service.js';

/**
 * Common Logic to Fetch All Ledger Balances for a given period.
 * Group classification is resolved per LedgerEntry.date via AccountLedger.groupHistory
 * (mid-FY group changes split amounts correctly across groups).
 */
const getLedgerBalances = async (startDate, endDate) => {
    return getLedgerBalancesByEntryGroup(startDate, endDate);
};

/**
 * Profit & Loss Report
 */
export const getProfitAndLossReport = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const end = endDate ? moment(endDate).endOf('day').toDate() : new Date();
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment(end).startOf('year').toDate();

    const { ledgerReports, groups } = await getLedgerBalances(start, end);

    // Filter for Income & Expenses
    const plLedgers = ledgerReports.filter(l => ['Income', 'Expenses'].includes(l.nature));

    // Group by Group
    const groupSummary = {};
    plLedgers.forEach(l => {
        const gId = l.groupId?.toString() || 'unmapped';
        if (!groupSummary[gId]) {
            groupSummary[gId] = {
                groupId: l.groupId,
                groupName: l.groupName,
                nature: l.nature,
                affectGrossProfit: l.affectGrossProfit,
                total: 0,
                ledgers: []
            };
        }
        groupSummary[gId].total += l.closingBalance;
        groupSummary[gId].ledgers.push(l);
    });

    const plGroups = Object.values(groupSummary);
    const incomeGroups = plGroups.filter(g => g.nature === 'Income').map(g => ({ ...g, totalAbs: Math.abs(g.total), isDebit: g.total >= 0 })); 
    const expenseGroups = plGroups.filter(g => g.nature === 'Expenses').map(g => ({ ...g, totalAbs: Math.abs(g.total), isDebit: g.total >= 0 }));

    // Income is usually Credit (negative in net logic)
    // Expense is usually Debit (positive in net logic)
    
    // Trading / Direct components
    const salesIncome = plGroups.filter(g => g.nature === 'Income' && g.groupName === 'Sales Accounts').reduce((sum, g) => sum - g.total, 0);
    const otherTradingIncome = plGroups.filter(g => g.nature === 'Income' && g.affectGrossProfit && g.groupName !== 'Sales Accounts').reduce((sum, g) => sum - g.total, 0);
    const tradingIncome = salesIncome + otherTradingIncome;

    const bomCost = plLedgers.filter(l => l.name === 'Purchase Account' || l.groupName === 'Purchase Accounts').reduce((sum, l) => sum + l.closingBalance, 0);
    const consumableCost = plLedgers.filter(l => l.name === 'Consumable Purchase / Non-BOM Raw Material Cost').reduce((sum, l) => sum + l.closingBalance, 0);
    
    // Direct Expenses (excluding the specific ones handled above)
    const otherDirectExpense = plGroups.filter(g => g.nature === 'Expenses' && g.affectGrossProfit && g.groupName !== 'Purchase Accounts').reduce((sum, g) => sum + g.total, 0) - consumableCost;

    const grossProfitAfterBOM = tradingIncome - bomCost;
    const grossProfit = grossProfitAfterBOM - consumableCost - otherDirectExpense;

    const totalIncome = plGroups.filter(g => g.nature === 'Income').reduce((sum, g) => sum - g.total, 0);
    const totalExpense = plGroups.filter(g => g.nature === 'Expenses').reduce((sum, g) => sum + g.total, 0);
    const netProfit = totalIncome - totalExpense;

    res.send(new ApiResponse(httpStatus.OK, {
        incomeGroups,
        expenseGroups,
        tradingIncome,
        salesIncome,
        otherTradingIncome,
        bomCost,
        consumableCost,
        otherDirectExpense,
        grossProfitAfterBOM,
        grossProfit,
        totalIncome,
        totalExpense,
        netProfit,
        period: { start, end }
    }));
});

/**
 * Balance Sheet Report
 */
export const getBalanceSheetReport = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const end = date ? moment(date).endOf('day').toDate() : new Date();

    const { ledgerReports, groups } = await getLedgerBalances(null, end);

    // Run a sub-calc for PL
    const plLedgers = ledgerReports.filter(l => ['Income', 'Expenses'].includes(l.nature));
    const totalIncome = plLedgers.filter(l => l.nature === 'Income').reduce((sum, l) => sum - l.closingBalance, 0);
    const totalExpense = plLedgers.filter(l => l.nature === 'Expenses').reduce((sum, l) => sum + l.closingBalance, 0);
    const currentYearProfit = totalIncome - totalExpense;

    // Filter for Assets & Liabilities
    const bsLedgers = ledgerReports.filter(l => ['Assets', 'Liabilities'].includes(l.nature));

    // Group BS by Group
    const groupSummary = {};
    bsLedgers.forEach(l => {
        const gId = l.groupId?.toString() || 'unmapped';
        if (!groupSummary[gId]) {
            groupSummary[gId] = {
                groupId: l.groupId,
                groupName: l.groupName,
                nature: l.nature,
                total: 0,
                ledgers: []
            };
        }
        groupSummary[gId].total += l.closingBalance;
        groupSummary[gId].ledgers.push(l);
    });

    const assetGroups = Object.values(groupSummary).filter(g => g.nature === 'Assets').map(g => ({ ...g, totalAbs: Math.abs(g.total), isDebit: g.total >= 0 }));
    const liabilityGroups = Object.values(groupSummary).filter(g => g.nature === 'Liabilities').map(g => ({ ...g, totalAbs: Math.abs(g.total), isDebit: g.total >= 0 }));

    const totalAssetsValue = assetGroups.reduce((sum, g) => sum + g.total, 0);
    const totalLiabilitiesValue = liabilityGroups.reduce((sum, g) => sum - g.total, 0);

    // Adjust for current profit (Capital side usually)
    const totalLiabilitiesSide = totalLiabilitiesValue + currentYearProfit;

    res.send(new ApiResponse(httpStatus.OK, {
        assetGroups,
        liabilityGroups,
        currentYearProfit,
        totalAssets: totalAssetsValue,
        totalLiabilities: totalLiabilitiesSide,
        isTallied: Math.abs(totalAssetsValue - totalLiabilitiesSide) < 0.1,
        diff: totalAssetsValue - totalLiabilitiesSide,
        date: end
    }));
});

/**
 * Trial Balance Report
 */
export const getTrialBalanceReport = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const end = date ? moment(date).endOf('day').toDate() : new Date();

    const { ledgerReports } = await getLedgerBalances(null, end);

    const totalDebit = ledgerReports.filter(l => l.closingBalance > 0).reduce((sum, l) => sum + l.closingBalance, 0);
    const totalCredit = ledgerReports.filter(l => l.closingBalance < 0).reduce((sum, l) => sum + Math.abs(l.closingBalance), 0);

    res.send(new ApiResponse(httpStatus.OK, {
        ledgers: ledgerReports.filter(l => l.closingBalance !== 0).map(l => ({ ...l, totalAbs: Math.abs(l.closingBalance) })),
        totalDebit,
        totalCredit,
        isTallied: Math.abs(totalDebit - totalCredit) < 0.1,
        diff: totalDebit - totalCredit
    }));
});

/**
 * Product-wise Gross Profit Report
 * Uses stored invoice line GP when available; legacy rows estimated at report time.
 */
export const getProductWiseProfitability = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getProductWiseGpReport({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        financialYear: req.query.financialYear,
        itemId: req.query.itemId,
        category: req.query.category,
        exportFilter: req.query.exportFilter,
        customerId: req.query.customerId,
    });

    const report = rows.map((r) => ({
        _id: r.itemId,
        itemCode: r.itemCode,
        itemName: r.itemName,
        totalQty: r.qtySold,
        totalSalesQty: r.qtySold,
        totalRevenue: r.salesValue,
        unitCost: r.avgCostRate,
        salesCost: r.costValue,
        grossProfit: r.gpAmount,
        gpPercent: r.gpPercent,
        costSource: r.primaryCostSource,
        avgRate: r.avgSaleRate,
        estimatedLines: r.estimatedLines,
        formula: 'GP = taxable sales value (ex GST) − cost at posting snapshot (or estimated for legacy invoices).',
    }));

    res.send(new ApiResponse(httpStatus.OK, report, 'Product-wise profitability report fetched'));
});

/**
 * GET /api/v1/accounting-reports/replacement-report
 * Fetches all outward replacements with cost impact
 */
export const getReplacementReport = asyncHandler(async (req, res) => {
    const { fromDate, toDate } = req.query;
    
    const filters = {
        orderCategory: 'Replacement',
        status: { $ne: 'Cancelled' },
        isDeleted: { $ne: true }
    };

    if (fromDate && toDate) {
        filters.invoiceDate = {
            $gte: new Date(fromDate + 'T00:00:00.000Z'),
            $lte: new Date(toDate + 'T23:59:59.999Z')
        };
    }

    const replacements = await SalesInvoice.find(filters)
        .populate('items.itemId', 'itemName itemCode valuationRate')
        .sort({ invoiceDate: -1 })
        .lean();

    const report = [];
    for (const inv of replacements) {
        for (const item of inv.items) {
            const unitCost = item.itemId?.valuationRate || 0;
            report.push({
                date: inv.invoiceDate,
                invoiceNumber: inv.invoiceNumber,
                customerName: inv.customerName,
                itemCode: item.itemCode,
                itemName: item.itemName,
                qty: item.qty,
                uom: item.uom,
                unitCost,
                totalCost: item.qty * unitCost,
                reason: inv.orderType || 'Warranty/Replacement',
                remarks: inv.remarks || '',
                originalInvoice: inv.buyerOrderNo || '' // Using buyerOrderNo or specific field if available
            });
        }
    }

    res.send(new ApiResponse(httpStatus.OK, report, 'Replacement outward report fetched'));
});

/**
 * GET /api/v1/accounting-reports/sample-conversion-report
 * Tracks if samples given to customers converted into regular sales
 */
export const getSampleConversionReport = asyncHandler(async (req, res) => {
    const { fromDate, toDate } = req.query;
    
    const sampleFilters = {
        orderCategory: 'Sample',
        status: { $ne: 'Cancelled' },
        isDeleted: { $ne: true }
    };

    if (fromDate && toDate) {
        sampleFilters.invoiceDate = {
            $gte: new Date(fromDate + 'T00:00:00.000Z'),
            $lte: new Date(toDate + 'T23:59:59.999Z')
        };
    }

    // 1. Get all Samples
    const samples = await SalesInvoice.find(sampleFilters).sort({ invoiceDate: 1 }).lean();
    
    const report = [];
    for (const sample of samples) {
        for (const item of sample.items) {
            // Find later sales for this customer and item
            const laterSales = await SalesInvoice.find({
                customerId: sample.customerId,
                'items.itemId': item.itemId,
                invoiceDate: { $gt: sample.invoiceDate },
                orderCategory: { $nin: ['Sample', 'Replacement'] },
                status: { $ne: 'Cancelled' },
                isDeleted: { $ne: true }
            }).sort({ invoiceDate: 1 }).limit(1).lean();

            const converted = laterSales.length > 0;
            const conversionDate = converted ? laterSales[0].invoiceDate : null;
            const daysToConvert = converted ? 
                Math.ceil((new Date(conversionDate) - new Date(sample.invoiceDate)) / (1000 * 60 * 60 * 24)) : null;

            // Fetch reason if not converted
            let reason = '';
            let matter = '';
            if (!converted) {
                const customer = await Customer.findById(sample.customerId).lean();
                reason = customer?.notConvertedDetails?.reason || '';
                matter = customer?.notConvertedDetails?.matter || '';
            }

            report.push({
                sampleDate: sample.invoiceDate,
                customerName: sample.customerName,
                itemCode: item.itemCode,
                itemName: item.itemName,
                sampleQty: item.qty,
                sampleValue: item.taxableAmount,
                converted: converted ? 'Yes' : 'No',
                conversionDate,
                daysToConvert,
                salesQty: converted ? laterSales[0].items.find(i => String(i.itemId) === String(item.itemId))?.qty : 0,
                salesperson: sample.salesPerson || 'N/A',
                reason,
                matter
            });
        }
    }

    res.send(new ApiResponse(httpStatus.OK, report, 'Sample to sales conversion report fetched'));
});

// ── Cash Flow Statement ─────────────────────────────────────────────────────

export const getCashFlowReport = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) throw new ApiError(httpStatus.BAD_REQUEST, 'startDate and endDate are required');
    const data = await getCashFlowStatement({ startDate, endDate });
    res.send(new ApiResponse(httpStatus.OK, data));
});

// ── Comparative P&L (two periods side-by-side) ─────────────────────────────

export const getComparativePL = asyncHandler(async (req, res) => {
    const { startDate1, endDate1, startDate2, endDate2 } = req.query;
    if (!startDate1 || !endDate1 || !startDate2 || !endDate2) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'All four date params are required: startDate1, endDate1, startDate2, endDate2');
    }

    const buildPL = async (start, end) => {
        const { ledgerReports } = await getLedgerBalances(new Date(start), new Date(end));
        const plLedgers = ledgerReports.filter(l => ['Income', 'Expenses'].includes(l.nature));
        const totalIncome = plLedgers.filter(l => l.nature === 'Income').reduce((s, l) => s - l.closingBalance, 0);
        const totalExpense = plLedgers.filter(l => l.nature === 'Expenses').reduce((s, l) => s + l.closingBalance, 0);
        // Build group-level summary
        const groups = {};
        plLedgers.forEach(l => {
            const k = l.groupId?.toString() || 'unmapped';
            if (!groups[k]) groups[k] = { groupName: l.groupName, nature: l.nature, total: 0 };
            groups[k].total += l.closingBalance;
        });
        return { groups: Object.values(groups), totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
    };

    const [period1, period2] = await Promise.all([
        buildPL(startDate1, endDate1),
        buildPL(startDate2, endDate2),
    ]);

    // Merge groups for comparison
    const allGroupNames = new Set([
        ...period1.groups.map(g => g.groupName),
        ...period2.groups.map(g => g.groupName),
    ]);

    const comparison = [...allGroupNames].map(name => {
        const p1 = period1.groups.find(g => g.groupName === name) || { total: 0, nature: '' };
        const p2 = period2.groups.find(g => g.groupName === name) || { total: 0, nature: '' };
        const variance = p2.total - p1.total;
        const variancePct = p1.total !== 0 ? +((variance / Math.abs(p1.total)) * 100).toFixed(2) : null;
        return { groupName: name, nature: p1.nature || p2.nature, period1: p1.total, period2: p2.total, variance, variancePct };
    });

    res.send(new ApiResponse(httpStatus.OK, {
        period1: { startDate: startDate1, endDate: endDate1, ...period1 },
        period2: { startDate: startDate2, endDate: endDate2, ...period2 },
        comparison,
    }));
});

// ── Comparative Balance Sheet ────────────────────────────────────────────────

export const getComparativeBS = asyncHandler(async (req, res) => {
    const { date1, date2 } = req.query;
    if (!date1 || !date2) throw new ApiError(httpStatus.BAD_REQUEST, 'date1 and date2 are required');

    const buildBS = async (date) => {
        const { ledgerReports } = await getLedgerBalances(null, new Date(date));
        const bsLedgers = ledgerReports.filter(l => ['Assets', 'Liabilities'].includes(l.nature));
        const groups = {};
        bsLedgers.forEach(l => {
            const k = l.groupId?.toString() || 'unmapped';
            if (!groups[k]) groups[k] = { groupName: l.groupName, nature: l.nature, total: 0 };
            groups[k].total += l.closingBalance;
        });
        return Object.values(groups);
    };

    const [g1, g2] = await Promise.all([buildBS(date1), buildBS(date2)]);
    const allNames = new Set([...g1.map(g => g.groupName), ...g2.map(g => g.groupName)]);

    const comparison = [...allNames].map(name => {
        const a = g1.find(g => g.groupName === name) || { total: 0, nature: '' };
        const b = g2.find(g => g.groupName === name) || { total: 0, nature: '' };
        const variance = b.total - a.total;
        return { groupName: name, nature: a.nature || b.nature, date1: a.total, date2: b.total, variance };
    });

    res.send(new ApiResponse(httpStatus.OK, { date1, date2, comparison }));
});

// ── Ageing Analysis ─────────────────────────────────────────────────────────

export const getAgeingAnalysis = asyncHandler(async (req, res) => {
    const { type, asOnDate, financialYear } = req.query;
    if (!type || !['Receivable', 'Payable'].includes(type)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'type must be Receivable or Payable');
    }

    const asOn = asOnDate ? new Date(asOnDate) : new Date();

    const fyMatch = financialYear ? { financialYear } : {};

    let invoices = [];
    if (type === 'Receivable') {
        invoices = await SalesInvoice.find({
            paymentStatus: { $ne: 'Paid' },
            status: 'Confirmed',
            isDeleted: false,
            ...fyMatch,
        }).select('invoiceDate invoiceNumber customerName grandTotal paidAmount dueDate').lean();
    } else {
        const pi = await PurchaseInvoice.find({
            paymentStatus: { $ne: 'Paid' },
            status: { $in: ['Confirmed', 'Posted'] },
            isDeleted: false,
            ...fyMatch,
        }).select('invoiceDate invoiceNumber supplierName grandTotal paidAmount dueDate').lean();
        invoices = pi.map(i => ({ ...i, customerName: i.supplierName }));
    }

    const buckets = { current: [], days0_30: [], days31_60: [], days61_90: [], days91_180: [], days181_365: [], over365: [] };

    invoices.forEach(inv => {
        const outstanding = (inv.grandTotal || 0) - (inv.paidAmount || 0);
        if (outstanding <= 0) return;
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate);
        const daysPast = Math.floor((asOn - dueDate) / (1000 * 60 * 60 * 24));
        const row = {
            partyName: inv.customerName,
            invoiceNo: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            dueDate,
            daysPast,
            outstanding: +outstanding.toFixed(2),
        };
        if (daysPast <= 0) buckets.current.push(row);
        else if (daysPast <= 30) buckets.days0_30.push(row);
        else if (daysPast <= 60) buckets.days31_60.push(row);
        else if (daysPast <= 90) buckets.days61_90.push(row);
        else if (daysPast <= 180) buckets.days91_180.push(row);
        else if (daysPast <= 365) buckets.days181_365.push(row);
        else buckets.over365.push(row);
    });

    const sumBucket = (b) => b.reduce((s, r) => s + r.outstanding, 0);

    res.send(new ApiResponse(httpStatus.OK, {
        type, asOnDate: asOn,
        buckets,
        summary: {
            current: +sumBucket(buckets.current).toFixed(2),
            '0-30': +sumBucket(buckets.days0_30).toFixed(2),
            '31-60': +sumBucket(buckets.days31_60).toFixed(2),
            '61-90': +sumBucket(buckets.days61_90).toFixed(2),
            '91-180': +sumBucket(buckets.days91_180).toFixed(2),
            '181-365': +sumBucket(buckets.days181_365).toFixed(2),
            'over365': +sumBucket(buckets.over365).toFixed(2),
            total: +invoices.reduce((s, i) => s + Math.max(0, (i.grandTotal || 0) - (i.paidAmount || 0)), 0).toFixed(2),
        },
    }));
});

// ── MSME Compliance Report ───────────────────────────────────────────────────

export const getMsmeReport = asyncHandler(async (req, res) => {
    const { asOnDate, financialYear } = req.query;
    const asOn = asOnDate ? new Date(asOnDate) : new Date();
    const MSME_DAYS = 45;

    const fyMatch = financialYear ? { financialYear } : {};

    const msmeLedgerIds = (await AccountLedger.find({ msmeApplicable: true }).select('_id name').lean()).map(l => l._id);
    if (!msmeLedgerIds.length) return res.send(new ApiResponse(httpStatus.OK, { items: [], totalOverdue: 0 }));

    const piList = await PurchaseInvoice.find({
        supplierId: { $exists: true },
        paymentStatus: { $ne: 'Paid' },
        status: { $in: ['Confirmed', 'Posted'] },
        isDeleted: false,
        ...fyMatch,
    }).select('invoiceDate invoiceNumber supplierName grandTotal paidAmount').lean();

    const items = [];
    for (const inv of piList) {
        const outstanding = (inv.grandTotal || 0) - (inv.paidAmount || 0);
        if (outstanding <= 0) continue;
        const daysPast = Math.floor((asOn - new Date(inv.invoiceDate)) / (1000 * 60 * 60 * 24));
        if (daysPast > MSME_DAYS) {
            items.push({
                supplierName: inv.supplierName,
                invoiceNo: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                daysPast,
                outstanding: +outstanding.toFixed(2),
                exceededBy: daysPast - MSME_DAYS,
            });
        }
    }

    items.sort((a, b) => b.daysPast - a.daysPast);
    const totalOverdue = items.reduce((s, i) => s + i.outstanding, 0);

    res.send(new ApiResponse(httpStatus.OK, { asOnDate: asOn, msmeDaysLimit: MSME_DAYS, items, totalOverdue: +totalOverdue.toFixed(2) }));
});

// ── Ratio Analysis ───────────────────────────────────────────────────────────

export const getRatioAnalysis = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const end = date ? new Date(date) : new Date();

    const { ledgerReports } = await getLedgerBalances(null, end);

    const sumByNature = (nature) => ledgerReports.filter(l => l.nature === nature).reduce((s, l) => s + l.closingBalance, 0);
    const sumByGroup = (gName) => ledgerReports.filter(l => (l.groupName || '').toLowerCase().includes(gName.toLowerCase())).reduce((s, l) => s + l.closingBalance, 0);

    const totalAssets = sumByNature('Assets');
    const totalLiabilities = Math.abs(sumByNature('Liabilities'));
    const totalIncome = Math.abs(sumByNature('Income'));
    const totalExpense = sumByNature('Expenses');
    const netProfit = totalIncome - totalExpense;

    const currentAssets = sumByGroup('current asset');
    const currentLiabilities = Math.abs(sumByGroup('current liabilit'));
    const inventory = sumByGroup('stock') + sumByGroup('inventory');
    const cash = ledgerReports.filter(l => l.groupName?.toLowerCase().includes('cash') || l.groupName?.toLowerCase().includes('bank')).reduce((s, l) => s + l.closingBalance, 0);

    const safe = (n, d) => d !== 0 ? +( n / d).toFixed(4) : null;

    const ratios = {
        liquidity: {
            currentRatio: safe(currentAssets, currentLiabilities),
            quickRatio: safe(currentAssets - inventory, currentLiabilities),
            cashRatio: safe(cash, currentLiabilities),
        },
        profitability: {
            netProfitMargin: safe(netProfit, totalIncome),
            returnOnAssets: safe(netProfit, totalAssets),
            returnOnEquity: safe(netProfit, totalAssets - totalLiabilities),
        },
        solvency: {
            debtToEquity: safe(totalLiabilities, totalAssets - totalLiabilities),
            debtToAssets: safe(totalLiabilities, totalAssets),
        },
    };

    res.send(new ApiResponse(httpStatus.OK, {
        asOfDate: end,
        totals: { totalAssets, totalLiabilities, totalIncome, totalExpense, netProfit, currentAssets, currentLiabilities, inventory, cash },
        ratios,
    }));
});

// ── Fund Flow Statement ──────────────────────────────────────────────────────

export const getFundFlowStatement = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) throw new ApiError(httpStatus.BAD_REQUEST, 'startDate and endDate are required');

    const start = new Date(startDate);
    const end = new Date(endDate);

    const allLedgers = await AccountLedger.find({}).lean();
    const allGroups = await AccountGroup.find({}).lean();
    const groupMap = {};
    allGroups.forEach(g => { groupMap[g._id.toString()] = g; });

    const getBalanceAt = async (date) => {
        const entries = await LedgerEntry.aggregate([
            { $match: { date: { $lte: date } } },
            { $group: { _id: '$ledgerId', debit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } }, credit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } } } },
        ]);
        const m = {};
        entries.forEach(e => { m[e._id.toString()] = e.debit - e.credit; });
        return m;
    };

    const [openMap, closeMap] = await Promise.all([getBalanceAt(new Date(start - 1)), getBalanceAt(end)]);

    const changes = allLedgers.map(l => {
        const ob = (l.drCr === 'Cr' ? -(l.openingBalance || 0) : (l.openingBalance || 0)) + (openMap[l._id.toString()] || 0);
        const cb = (l.drCr === 'Cr' ? -(l.openingBalance || 0) : (l.openingBalance || 0)) + (closeMap[l._id.toString()] || 0);
        const grp = l.underGroup ? groupMap[l.underGroup.toString()] : null;
        const gName = (grp?.name || '').toLowerCase();
        const isWorkingCapital = !gName.includes('fixed') && !gName.includes('loan') && !gName.includes('capital') && !gName.includes('term');
        return { name: l.name, groupName: grp?.name || '', nature: grp?.nature || '', ob, cb, change: cb - ob, isWorkingCapital };
    }).filter(c => Math.abs(c.change) > 0.01);

    const workingCapitalIncreases = changes.filter(c => c.isWorkingCapital && c.change > 0).map(c => ({ name: c.name, amount: +c.change.toFixed(2) }));
    const workingCapitalDecreases = changes.filter(c => c.isWorkingCapital && c.change < 0).map(c => ({ name: c.name, amount: +Math.abs(c.change).toFixed(2) }));

    const sourcesOfFunds = changes.filter(c => !c.isWorkingCapital && (
        (c.nature === 'Liabilities' && c.change < 0) || (c.nature === 'Assets' && c.change > 0)
    )).map(c => ({ name: c.name, amount: +Math.abs(c.change).toFixed(2) }));

    const useOfFunds = changes.filter(c => !c.isWorkingCapital && (
        (c.nature === 'Assets' && c.change < 0) || (c.nature === 'Liabilities' && c.change > 0)
    )).map(c => ({ name: c.name, amount: +Math.abs(c.change).toFixed(2) }));

    const totalSources = sourcesOfFunds.reduce((s, i) => s + i.amount, 0);
    const totalUse = useOfFunds.reduce((s, i) => s + i.amount, 0);

    res.send(new ApiResponse(httpStatus.OK, {
        period: { startDate, endDate },
        sourcesOfFunds, totalSources: +totalSources.toFixed(2),
        useOfFunds, totalUse: +totalUse.toFixed(2),
        workingCapitalIncreases, workingCapitalDecreases,
        netChangeInWorkingCapital: +(workingCapitalIncreases.reduce((s, i) => s + i.amount, 0) - workingCapitalDecreases.reduce((s, i) => s + i.amount, 0)).toFixed(2),
    }));
});

// ── Interest Calculation on Overdue Bills ────────────────────────────────────

export const getInterestOnOverdue = asyncHandler(async (req, res) => {
    const { type, asOnDate, ratePercent, financialYear } = req.query;
    if (!type || !['Receivable', 'Payable'].includes(type)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'type must be Receivable or Payable');
    }
    const rate = parseFloat(ratePercent || '18');
    const asOn = asOnDate ? new Date(asOnDate) : new Date();
    const fyMatch = financialYear ? { financialYear } : {};

    let invoices = [];
    if (type === 'Receivable') {
        invoices = await SalesInvoice.find({ paymentStatus: { $ne: 'Paid' }, status: 'Confirmed', isDeleted: false, ...fyMatch }).lean();
        invoices = invoices.map(i => ({ partyName: i.customerName, invoiceNo: i.invoiceNumber, invoiceDate: i.invoiceDate, dueDate: i.dueDate || i.invoiceDate, outstanding: (i.grandTotal || 0) - (i.paidAmount || 0) }));
    } else {
        const pi = await PurchaseInvoice.find({ paymentStatus: { $ne: 'Paid' }, status: { $in: ['Confirmed', 'Posted'] }, isDeleted: false, ...fyMatch }).lean();
        invoices = pi.map(i => ({ partyName: i.supplierName, invoiceNo: i.invoiceNumber, invoiceDate: i.invoiceDate, dueDate: i.dueDate || i.invoiceDate, outstanding: (i.grandTotal || 0) - (i.paidAmount || 0) }));
    }

    const items = invoices
        .filter(i => i.outstanding > 0)
        .map(inv => {
            const due = new Date(inv.dueDate);
            const overdueDays = Math.max(0, Math.floor((asOn - due) / (1000 * 60 * 60 * 24)));
            const interest = +(inv.outstanding * rate / 100 * overdueDays / 365).toFixed(2);
            return { ...inv, outstanding: +inv.outstanding.toFixed(2), overdueDays, interest, annualRate: rate };
        })
        .filter(i => i.overdueDays > 0)
        .sort((a, b) => b.overdueDays - a.overdueDays);

    const totalInterest = items.reduce((s, i) => s + i.interest, 0);
    const totalOutstanding = items.reduce((s, i) => s + i.outstanding, 0);

    res.send(new ApiResponse(httpStatus.OK, {
        type, asOnDate: asOn, annualRate: rate,
        items, totalInterest: +totalInterest.toFixed(2), totalOutstanding: +totalOutstanding.toFixed(2),
    }));
});
