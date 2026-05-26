import moment from 'moment';
import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Item } from '../models/item.model.js';
import { WorkOrder } from '../models/workOrder.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Voucher } from '../models/voucher.model.js';
import { BankStatementLine } from '../models/bankStatementLine.model.js';
import { Gstr2bData } from '../models/gstr2bData.model.js';
import { Gstr3bAdjustment } from '../models/gstr3bAdjustment.model.js';
import { TdsDeduction } from '../models/tdsDeduction.model.js';
import Followup from '../models/followup.model.js';
import { CreditDebitNote } from '../models/creditDebitNote.model.js';
import { parseFinancialYearRange } from '../constants/tds.constants.js';
import * as gpAnalysis from './gpAnalysis.service.js';
import * as tdsService from './tds.service.js';
import { getAgeingBucket, computeOverdueDays } from './accounting/billWiseSettlement.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const AGE_BUCKETS = ['0-30', '31-60', '61-90', '91-180', '180+'];

/** Parse dashboard filter query into normalized shape. */
export function parseDirectorMisFilters(query = {}) {
    const financialYear = String(query.financialYear || '').trim();
    let startDate = query.startDate ? moment(query.startDate).startOf('day') : null;
    let endDate = query.endDate ? moment(query.endDate).endOf('day') : null;

    if (query.month) {
        const m = moment(query.month, ['YYYY-MM', 'MM-YYYY'], true);
        if (m.isValid()) {
            startDate = m.clone().startOf('month');
            endDate = m.clone().endOf('day');
        }
    }

    if (!startDate && financialYear) {
        const range = parseFinancialYearRange(financialYear);
        if (range) {
            startDate = moment(range.start);
            endDate = moment(range.end);
        }
    }

    if (!endDate) endDate = moment().endOf('day');
    if (!startDate) startDate = moment(endDate).startOf('month');

    return {
        financialYear,
        startDate: startDate.toDate(),
        endDate: endDate.toDate(),
        startDateStr: startDate.format('YYYY-MM-DD'),
        endDateStr: endDate.format('YYYY-MM-DD'),
        customerId: query.customerId || null,
        category: query.category || null,
        exportFilter: query.exportFilter || query.tradeType || '',
        branch: query.branch || '',
        itemId: query.itemId || null,
    };
}

async function sumOpenSalesOutstanding(financialYear) {
    const fyMatch = financialYear ? { financialYear } : {};
    const bills = await SalesInvoice.find({
        paymentStatus: { $ne: 'Paid' },
        status: 'Confirmed',
        isDeleted: false,
        ...fyMatch,
    })
        .select('customerId customerName paymentDueDate grandTotal roundedTotal paidAmount')
        .lean();

    const byCustomer = new Map();
    let total = 0;
    for (const b of bills) {
        const pending = Math.max(0, (b.roundedTotal || b.grandTotal || 0) - (b.paidAmount || 0));
        if (pending <= 0.005) continue;
        total += pending;
        const key = String(b.customerId || b.customerName);
        const row = byCustomer.get(key) || {
            ledgerName: b.customerName || '—',
            customerId: b.customerId,
            outstanding: 0,
            overdueDays: 0,
            ageingBucket: '0-30',
        };
        row.outstanding = r2(row.outstanding + pending);
        const days = computeOverdueDays(b.paymentDueDate, pending);
        row.overdueDays = Math.max(row.overdueDays, days);
        row.ageingBucket = getAgeingBucket(row.overdueDays);
        byCustomer.set(key, row);
    }
    return { total: r2(total), rows: [...byCustomer.values()] };
}

async function sumOpenPurchaseOutstanding(financialYear) {
    const fyMatch = financialYear ? { financialYear } : {};
    const bills = await PurchaseInvoice.find({
        paymentStatus: { $ne: 'Paid' },
        status: { $in: ['Confirmed', 'Posted'] },
        isDeleted: false,
        ...fyMatch,
    })
        .select('supplierId supplierName dueDate grandTotal paidAmount')
        .lean();

    const bySupplier = new Map();
    let total = 0;
    for (const b of bills) {
        const pending = Math.max(0, (b.grandTotal || 0) - (b.paidAmount || 0));
        if (pending <= 0.005) continue;
        total += pending;
        const key = String(b.supplierId || b.supplierName);
        const row = bySupplier.get(key) || {
            ledgerName: b.supplierName || '—',
            supplierId: b.supplierId,
            outstanding: 0,
            overdueDays: 0,
            ageingBucket: '0-30',
        };
        row.outstanding = r2(row.outstanding + pending);
        const days = computeOverdueDays(b.dueDate, pending);
        row.overdueDays = Math.max(row.overdueDays, days);
        row.ageingBucket = getAgeingBucket(row.overdueDays);
        bySupplier.set(key, row);
    }
    return { total: r2(total), rows: [...bySupplier.values()] };
}

function buildInvoiceMatch(filters) {
    const match = {
        isDeleted: { $ne: true },
        status: { $nin: ['Cancelled', 'Draft'] },
        documentType: { $nin: ['Estimate', 'Credit Note'] },
        invoiceDate: { $gte: filters.startDate, $lte: filters.endDate },
    };
    if (filters.financialYear) match.financialYear = filters.financialYear;
    if (filters.customerId) match.customerId = filters.customerId;
    if (filters.exportFilter === 'export') {
        match.$or = [
            { customerRegistrationType: /export/i },
            { invoiceType: 'Deemed Export' },
            { exportCountry: { $nin: [null, '', 'India'] } },
        ];
    } else if (filters.exportFilter === 'domestic') {
        match.$and = [
            { customerRegistrationType: { $not: /export/i } },
            { invoiceType: { $ne: 'Deemed Export' } },
        ];
    }
    return match;
}

async function getLedgerClosingBalances(asOfDate) {
    const end = asOfDate || new Date();
    const ledgers = await AccountLedger.find({}).lean();
    const groups = await AccountGroup.find({}).lean();
    const groupMap = Object.fromEntries(groups.map((g) => [g._id.toString(), g]));

    const entries = await LedgerEntry.aggregate([
        { $match: { date: { $lte: end } } },
        {
            $group: {
                _id: '$ledgerId',
                totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
                totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } },
            },
        },
    ]);

    const entryMap = Object.fromEntries(
        entries.map((e) => [e._id.toString(), e.totalDebit - e.totalCredit]),
    );

    return ledgers.map((l) => {
        const signedOpening = (l.drCr === 'Cr' ? -1 : 1) * (l.openingBalance || 0);
        const net = entryMap[l._id.toString()] || 0;
        const closingBalance = signedOpening + net;
        const group = l.underGroup ? groupMap[l.underGroup.toString()] : null;
        return {
            ...l,
            groupName: l.groupName || group?.name || '',
            nature: group?.nature || 'General',
            closingBalance,
        };
    });
}

function sumLedgersByGroupPattern(balances, pattern) {
    return r2(
        balances
            .filter((l) => pattern.test(l.groupName || '') || pattern.test(l.name || ''))
            .reduce((s, l) => s + Math.abs(l.closingBalance), 0),
    );
}

export async function getAccountingSummary(filters) {
    const balances = await getLedgerClosingBalances(filters.endDate);
    const monthStart = moment(filters.endDate).startOf('month').toDate();

    const cashBalance = sumLedgersByGroupPattern(balances, /cash-in-hand|petty cash|^cash$/i);
    const bankBalance = sumLedgersByGroupPattern(balances, /bank account|current account|savings|overdraft|hdfc|icici|sbi/i);

    const [receivableData, payableData] = await Promise.all([
        sumOpenSalesOutstanding(filters.financialYear),
        sumOpenPurchaseOutstanding(filters.financialYear),
    ]);

    const totalReceivables = receivableData.total;
    const totalPayables = payableData.total;

    const totalDebit = balances.filter((l) => l.closingBalance > 0).reduce((s, l) => s + l.closingBalance, 0);
    const totalCredit = balances.filter((l) => l.closingBalance < 0).reduce((s, l) => s + Math.abs(l.closingBalance), 0);
    const tbMatched = Math.abs(totalDebit - totalCredit) < 0.1;

    const incomeLedgers = balances.filter((l) => l.nature === 'Income');
    const expenseLedgers = balances.filter((l) => l.nature === 'Expenses');

    const monthEntries = await LedgerEntry.aggregate([
        { $match: { date: { $gte: monthStart, $lte: filters.endDate } } },
        {
            $group: {
                _id: '$ledgerId',
                debit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
                credit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } },
            },
        },
    ]);
    const monthMap = Object.fromEntries(monthEntries.map((e) => [e._id.toString(), e]));

    let monthIncome = 0;
    let monthExpenses = 0;
    for (const l of incomeLedgers) {
        const e = monthMap[l._id.toString()];
        if (e) monthIncome += e.credit - e.debit;
    }
    for (const l of expenseLedgers) {
        const e = monthMap[l._id.toString()];
        if (e) monthExpenses += e.debit - e.credit;
    }

    return {
        cashBalance,
        bankBalance,
        totalReceivables,
        totalPayables,
        netWorkingCapital: r2(totalReceivables + cashBalance + bankBalance - totalPayables),
        trialBalanceStatus: tbMatched ? 'matched' : 'mismatch',
        trialBalanceDiff: r2(totalDebit - totalCredit),
        currentMonthIncome: r2(monthIncome),
        currentMonthExpenses: r2(monthExpenses),
        netProfitEstimate: r2(monthIncome - monthExpenses),
    };
}

function bucketAgeing(rows) {
    const buckets = Object.fromEntries(AGE_BUCKETS.map((b) => [b, { count: 0, amount: 0 }]));
    for (const r of rows) {
        const b = AGE_BUCKETS.includes(r.ageingBucket) ? r.ageingBucket : '0-30';
        buckets[b].count += 1;
        buckets[b].amount = r2(buckets[b].amount + (r.outstanding || 0));
    }
    return buckets;
}

export async function getRecoverySummary(filters) {
    const [receivableData, payableData] = await Promise.all([
        sumOpenSalesOutstanding(filters.financialYear),
        sumOpenPurchaseOutstanding(filters.financialYear),
    ]);

    const receivableRows = receivableData.rows;
    const payableRows = payableData.rows;
    const totalDebtors = receivableData.total;
    const totalCreditors = payableData.total;

    const overdueCustomers = receivableRows
        .filter((r) => (r.overdueDays || 0) > 0)
        .sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0))
        .slice(0, 15);

    const overdueSuppliers = payableRows
        .filter((r) => (r.overdueDays || 0) > 0)
        .sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0))
        .slice(0, 15);

    const highRiskRecovery = receivableRows
        .filter((r) => r.ageingBucket === '91-180' || r.ageingBucket === '180+')
        .sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))
        .slice(0, 10);

    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();
    const followUpDueToday = await Followup.find({
        nextCallDate: { $gte: todayStart, $lte: todayEnd },
    })
        .populate('customerId', 'customerName companyName')
        .limit(20)
        .lean();

    return {
        totalDebtors,
        totalCreditors,
        receivableAgeing: bucketAgeing(receivableRows),
        payableAgeing: bucketAgeing(payableRows),
        overdueCustomers,
        overdueSuppliers,
        followUpDueToday: followUpDueToday.map((f) => ({
            customerId: f.customerId?._id,
            customerName: f.customerId?.customerName || f.customerId?.companyName || '—',
            priority: f.priority,
            followUpType: f.followUpType,
        })),
        highRiskRecovery,
    };
}

export async function getSalesSummary(filters) {
    const match = buildInvoiceMatch(filters);

    const [totals, exportDomestic, topCustomers, pendingOrders, salesReturns] = await Promise.all([
        SalesInvoice.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: '$grandTotal' },
                    taxableSales: { $sum: '$totalTaxableAmount' },
                    totalGst: { $sum: '$totalGst' },
                    invoiceCount: { $sum: 1 },
                },
            },
        ]),
        SalesInvoice.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        $cond: [
                            {
                                $or: [
                                    { $regexMatch: { input: { $ifNull: ['$customerRegistrationType', ''] }, regex: /export/i } },
                                    { $eq: ['$invoiceType', 'Deemed Export'] },
                                ],
                            },
                            'export',
                            'domestic',
                        ],
                    },
                    amount: { $sum: '$totalTaxableAmount' },
                },
            },
        ]),
        SalesInvoice.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$customerId',
                    customerName: { $first: '$customerName' },
                    sales: { $sum: '$grandTotal' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { sales: -1 } },
            { $limit: 10 },
        ]),
        SalesOrder.find({
            status: { $nin: ['Invoiced', 'Cancelled', 'Draft'] },
            isDeleted: { $ne: true },
            ...(filters.financialYear ? { financialYear: filters.financialYear } : {}),
        })
            .select('soNumber customerName grandTotal status orderDate')
            .sort({ orderDate: -1 })
            .limit(50)
            .lean(),
        CreditDebitNote.aggregate([
            {
                $match: {
                    noteType: 'Credit Note',
                    noteDate: { $gte: filters.startDate, $lte: filters.endDate },
                    status: { $ne: 'Cancelled' },
                },
            },
            { $group: { _id: null, amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
        ]),
    ]);

    const t = totals[0] || { totalSales: 0, taxableSales: 0, totalGst: 0, invoiceCount: 0 };
    const exportMap = Object.fromEntries(exportDomestic.map((r) => [r._id, r.amount]));
    const monthsInRange = Math.max(1, moment(filters.endDate).diff(moment(filters.startDate), 'months', true));

    const productPipeline = [
        { $match: match },
        { $unwind: '$items' },
    ];
    if (filters.category) {
        productPipeline.push({ $match: { 'items.itemCategory': filters.category } });
    }
    productPipeline.push(
        {
            $group: {
                _id: '$items.itemId',
                itemCode: { $first: '$items.itemCode' },
                itemName: { $first: '$items.itemName' },
                qty: { $sum: '$items.qty' },
                sales: { $sum: '$items.taxableAmount' },
            },
        },
        { $sort: { sales: -1 } },
        { $limit: 10 },
    );

    const topProducts = await SalesInvoice.aggregate(productPipeline);

    return {
        totalSales: r2(t.totalSales),
        taxableSales: r2(t.taxableSales),
        exportSales: r2(exportMap.export || 0),
        domesticSales: r2(exportMap.domestic || 0),
        salesReturn: r2(salesReturns[0]?.amount || 0),
        salesReturnCount: salesReturns[0]?.count || 0,
        averageMonthlySales: r2(t.totalSales / monthsInRange),
        invoiceCount: t.invoiceCount,
        topCustomers: topCustomers.map((c) => ({
            customerId: c._id,
            customerName: c.customerName,
            sales: r2(c.sales),
            invoiceCount: c.count,
        })),
        topProducts: topProducts.map((p) => ({
            itemId: p._id,
            itemCode: p.itemCode,
            itemName: p.itemName,
            qty: p.qty,
            sales: r2(p.sales),
        })),
        pendingSalesOrders: pendingOrders.length,
        pendingSalesOrdersList: pendingOrders.slice(0, 10),
        orderToInvoicePendingAmount: r2(pendingOrders.reduce((s, o) => s + (o.grandTotal || 0), 0)),
    };
}

export async function getGstSummary(filters) {
    const invMatch = buildInvoiceMatch(filters);
    const purMatch = {
        isDeleted: { $ne: true },
        status: { $in: ['Confirmed', 'Posted'] },
        invoiceDate: { $gte: filters.startDate, $lte: filters.endDate },
    };
    if (filters.financialYear) purMatch.financialYear = filters.financialYear;

    const [outputAgg, inputAgg, rcmAgg, mismatchAgg, exportPending] = await Promise.all([
        SalesInvoice.aggregate([
            { $match: invMatch },
            {
                $group: {
                    _id: null,
                    cgst: { $sum: '$totalCgst' },
                    sgst: { $sum: '$totalSgst' },
                    igst: { $sum: '$totalIgst' },
                },
            },
        ]),
        PurchaseInvoice.aggregate([
            { $match: purMatch },
            {
                $group: {
                    _id: null,
                    cgst: { $sum: '$totalCgst' },
                    sgst: { $sum: '$totalSgst' },
                    igst: { $sum: '$totalIgst' },
                },
            },
        ]),
        PurchaseInvoice.aggregate([
            { $match: { ...purMatch, reverseCharge: true } },
            {
                $group: {
                    _id: null,
                    cgst: { $sum: '$totalCgst' },
                    sgst: { $sum: '$totalSgst' },
                    igst: { $sum: '$totalIgst' },
                },
            },
        ]),
        Gstr2bData.aggregate([
            {
                $match: {
                    ...(filters.financialYear ? { financialYear: filters.financialYear } : {}),
                    reconciliationStatus: { $in: ['Mismatch', 'Books Only', '2B Only', 'Pending Supplier Filing'] },
                },
            },
            {
                $group: {
                    _id: '$reconciliationStatus',
                    count: { $sum: 1 },
                    value: { $sum: '$taxableValue' },
                },
            },
        ]),
        SalesInvoice.countDocuments({
            ...invMatch,
            $or: [
                { customerRegistrationType: /export/i },
                { exportCountry: { $nin: [null, '', 'India'] } },
            ],
        }),
    ]);

    const out = outputAgg[0] || { cgst: 0, sgst: 0, igst: 0 };
    const inp = inputAgg[0] || { cgst: 0, sgst: 0, igst: 0 };
    const rcm = rcmAgg[0] || { cgst: 0, sgst: 0, igst: 0 };

    const outputGst = r2((out.cgst || 0) + (out.sgst || 0) + (out.igst || 0));
    const inputGst = r2((inp.cgst || 0) + (inp.sgst || 0) + (inp.igst || 0));
    const rcmPayable = r2((rcm.cgst || 0) + (rcm.sgst || 0) + (rcm.igst || 0));
    const netGstPayable = r2(outputGst + rcmPayable - inputGst);

    const g3bMonth = moment(filters.endDate).format('MM');
    const g3bAdj = filters.financialYear
        ? await Gstr3bAdjustment.findOne({ financialYear: filters.financialYear, month: g3bMonth }).lean()
        : null;

    const mismatchCount = mismatchAgg.reduce((s, m) => s + m.count, 0);
    const mismatchValue = r2(mismatchAgg.reduce((s, m) => s + (m.value || 0), 0));

    return {
        outputGst,
        inputGst,
        rcmPayable,
        netGstPayable,
        gstPaid: 0,
        gstBalance: r2(netGstPayable),
        gstr1Status: 'Available',
        gstr3bStatus: g3bAdj?.status || 'Not Filed',
        mismatch2a2bCount: mismatchCount,
        mismatch2a2bValue: mismatchValue,
        mismatchBreakdown: mismatchAgg,
        exportProofPending: exportPending,
    };
}

export async function getTdsSummary(filters) {
    if (!filters.financialYear) {
        return {
            skipped: true,
            message: 'financialYear required for TDS summary',
        };
    }

    const dashboard = await tdsService.getDashboardSummary(filters.financialYear);
    const quarterAgg = await TdsDeduction.aggregate([
        { $match: { financialYear: filters.financialYear } },
        {
            $group: {
                _id: '$quarter',
                tdsAmount: { $sum: '$tdsAmount' },
                paid: { $sum: '$amountPaid' },
                count: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    return {
        ...dashboard.summary,
        alerts: dashboard.alerts,
        sectionWise: dashboard.sectionWise,
        quarterWise: quarterAgg.map((q) => ({
            quarter: q._id || '—',
            tdsDeducted: r2(q.tdsAmount),
            tdsPaid: r2(q.paid),
            unpaid: r2(Math.max(0, q.tdsAmount - q.paid)),
            count: q.count,
        })),
        tdsDeducted: dashboard.summary?.totalTdsDeducted,
        tdsPayable: dashboard.summary?.tdsPayableBalance,
        tdsPaid: dashboard.summary?.tdsDepositedViaChallansInFy,
        unpaidTds: dashboard.summary?.tdsPayableBalance,
        challanPending: dashboard.summary?.pendingChallanMappings,
        panMissingCases: dashboard.summary?.invalidPanRows,
    };
}

export async function getMsmePayableSummary(filters) {
    const msmeSuppliers = await Supplier.find({ msmeApplicable: true, isActive: { $ne: false } })
        .select('_id supplierName msmeApplicable')
        .lean();
    const msmeIds = msmeSuppliers.map((s) => s._id);
    if (!msmeIds.length) {
        return { msmeSupplierOutstanding: 0, dueWithin7Days: 0, overdue: 0, riskAmount: 0, items: [] };
    }

    const fyMatch = filters.financialYear ? { financialYear: filters.financialYear } : {};
    const bills = await PurchaseInvoice.find({
        supplierId: { $in: msmeIds },
        paymentStatus: { $ne: 'Paid' },
        status: { $in: ['Confirmed', 'Posted'] },
        isDeleted: false,
        ...fyMatch,
    })
        .select('supplierId supplierName dueDate grandTotal paidAmount invoiceNumber')
        .lean();

    const now = moment();
    const in7 = moment().add(7, 'days');
    let total = 0;
    let due7 = 0;
    let overdue = 0;
    let risk = 0;
    const items = [];

    for (const b of bills) {
        const pending = Math.max(0, (b.grandTotal || 0) - (b.paidAmount || 0));
        if (pending <= 0) continue;
        total += pending;
        const due = b.dueDate ? moment(b.dueDate) : null;
        const days = due ? now.diff(due, 'days') : 0;
        if (due && due.isBefore(now)) {
            overdue += pending;
            if (days > 45) risk += pending;
        } else if (due && due.isBefore(in7)) {
            due7 += pending;
        }
        items.push({
            supplierId: b.supplierId,
            supplierName: b.supplierName,
            invoiceNumber: b.invoiceNumber,
            pending: r2(pending),
            dueDate: b.dueDate,
            overdueDays: Math.max(0, days),
        });
    }

    return {
        msmeSupplierOutstanding: r2(total),
        dueWithin7Days: r2(due7),
        overdue: r2(overdue),
        riskAmount: r2(risk),
        items: items.sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 15),
    };
}

export async function getInventorySummary() {
    const items = await Item.find({ isActive: { $ne: false } })
        .select('itemCode itemName itemCategory currentStock valuationRate minStockLevel reorderLevel')
        .lean();

    let rmValue = 0;
    let fgValue = 0;
    const negativeStock = [];
    const lowStock = [];
    const topByValue = [];

    for (const i of items) {
        const stock = Number(i.currentStock) || 0;
        const rate = Number(i.valuationRate) || 0;
        const value = r2(stock * rate);

        if (i.itemCategory === 'RAW_MATERIAL') rmValue += value;
        if (['FINISHED_GOOD', 'TRADING'].includes(i.itemCategory)) fgValue += value;

        if (stock < 0) negativeStock.push({ itemCode: i.itemCode, itemName: i.itemName, stock });
        const min = i.minStockLevel ?? i.reorderLevel ?? 0;
        if (min > 0 && stock < min) lowStock.push({ itemCode: i.itemCode, itemName: i.itemName, stock, minLevel: min });

        if (value > 0) topByValue.push({ itemCode: i.itemCode, itemName: i.itemName, stock, value });
    }

    topByValue.sort((a, b) => b.value - a.value);

    return {
        rawMaterialStockValue: r2(rmValue),
        finishedGoodsStockValue: r2(fgValue),
        slowMovingCount: 0,
        negativeStockAlerts: negativeStock.slice(0, 10),
        lowStockAlerts: lowStock.slice(0, 10),
        topStockValueItems: topByValue.slice(0, 10),
    };
}

export async function getProductionSummary(filters) {
    const fyMatch = filters.financialYear ? { financialYear: filters.financialYear } : {};
    const openStatuses = ['Draft', 'Released', 'In Process', 'WIP – Waiting Material', 'On Hold'];

    const [openCount, completedCount, openWos, rmShortage] = await Promise.all([
        WorkOrder.countDocuments({ status: { $in: openStatuses }, ...fyMatch }),
        WorkOrder.countDocuments({ status: { $in: ['Completed', 'Closed'] }, ...fyMatch }),
        WorkOrder.find({ status: { $in: openStatuses }, ...fyMatch })
            .select('woNumber status targetQty finishedProductName plannedEnd stages wip')
            .limit(30)
            .lean(),
        WorkOrder.find({
            'wip.missingMandatoryItems.0': { $exists: true },
            status: { $in: openStatuses },
            ...fyMatch,
        })
            .select('woNumber finishedProductName wip.missingMandatoryItems')
            .limit(10)
            .lean(),
    ]);

    const stageWip = {};
    for (const wo of openWos) {
        const active = (wo.stages || []).find((s) => s.status === 'In Progress' || s.status === 'Pending');
        const key = active?.stageName || wo.status || 'Unknown';
        stageWip[key] = (stageWip[key] || 0) + (wo.targetQty || 0);
    }

    const delayAlerts = openWos
        .filter((wo) => wo.plannedEnd && moment(wo.plannedEnd).isBefore(moment()) && !['Completed', 'Closed'].includes(wo.status))
        .map((wo) => ({
            woNumber: wo.woNumber,
            product: wo.finishedProductName,
            plannedEnd: wo.plannedEnd,
            status: wo.status,
        }))
        .slice(0, 10);

    const pendingQty = openWos.reduce((s, wo) => s + (wo.targetQty || 0), 0);

    return {
        workOrdersOpen: openCount,
        workOrdersCompleted: completedCount,
        stageWiseWip: Object.entries(stageWip).map(([stage, qty]) => ({ stage, qty })),
        pendingProductionQty: pendingQty,
        rmShortageItems: rmShortage.map((wo) => ({
            woNumber: wo.woNumber,
            product: wo.finishedProductName,
            missing: wo.wip?.missingMandatoryItems || [],
        })),
        productionDelayAlerts: delayAlerts,
    };
}

export async function getExportMis(filters) {
    const match = {
        ...buildInvoiceMatch(filters),
        $or: [
            { customerRegistrationType: /export/i },
            { invoiceType: 'Deemed Export' },
            { exportCountry: { $nin: [null, '', 'India'] } },
        ],
    };

    const [totals, byCustomer, byItem, gpData] = await Promise.all([
        SalesInvoice.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    sales: { $sum: '$totalTaxableAmount' },
                    gst: { $sum: '$totalGst' },
                    count: { $sum: 1 },
                },
            },
        ]),
        SalesInvoice.aggregate([
            { $match: match },
            { $group: { _id: '$customerId', customerName: { $first: '$customerName' }, sales: { $sum: '$grandTotal' } } },
            { $sort: { sales: -1 } },
            { $limit: 10 },
        ]),
        SalesInvoice.aggregate([
            { $match: match },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.itemId',
                    itemCode: { $first: '$items.itemCode' },
                    itemName: { $first: '$items.itemName' },
                    sales: { $sum: '$items.taxableAmount' },
                },
            },
            { $sort: { sales: -1 } },
            { $limit: 10 },
        ]),
        gpAnalysis.getExportDomesticGpSummary({
            financialYear: filters.financialYear,
            startDate: filters.startDateStr,
            endDate: filters.endDateStr,
            exportFilter: 'export',
        }),
    ]);

    const t = totals[0] || { sales: 0, gst: 0, count: 0 };

    return {
        exportSales: r2(t.sales),
        exportInvoiceCount: t.count,
        exportProfit: gpData.export?.gpAmount ?? 0,
        exportGpPercent: gpData.export?.gpPercent ?? 0,
        lutExportPendingProof: t.count,
        merchantExportPendingProof: 0,
        differentialGstRisk: r2(t.gst),
        customerWiseExportSales: byCustomer.map((c) => ({
            customerId: c._id,
            customerName: c.customerName,
            sales: r2(c.sales),
        })),
        itemWiseExportSales: byItem.map((i) => ({
            itemId: i._id,
            itemCode: i.itemCode,
            itemName: i.itemName,
            sales: r2(i.sales),
        })),
    };
}

export async function getComplianceAlerts(filters, sections) {
    const alerts = [];

    if (sections.gst?.netGstPayable > 0) {
        alerts.push({ type: 'GST', severity: 'medium', message: `Net GST payable ₹${sections.gst.netGstPayable.toLocaleString('en-IN')}`, drilldown: 'gst-payable' });
    }
    if (sections.tds?.challanPending > 0) {
        alerts.push({ type: 'TDS', severity: 'high', message: `${sections.tds.challanPending} TDS challan mapping(s) pending`, drilldown: 'tds-challans' });
    }
    if (sections.msme?.overdue > 0) {
        alerts.push({ type: 'MSME', severity: 'high', message: `MSME overdue ₹${sections.msme.overdue.toLocaleString('en-IN')}`, drilldown: 'outstanding-payable' });
    }
    if (sections.inventory?.negativeStockAlerts?.length) {
        alerts.push({ type: 'Inventory', severity: 'high', message: `${sections.inventory.negativeStockAlerts.length} item(s) with negative stock`, drilldown: 'inventory' });
    }
    if (sections.gp?.negativeGpInvoices?.length) {
        alerts.push({ type: 'GP', severity: 'medium', message: `${sections.gp.negativeGpInvoices.length} invoice(s) with negative GP`, drilldown: 'negative-gp' });
    }

    const [unreconciledBank, draftVouchers] = await Promise.all([
        BankStatementLine.countDocuments({ matchStatus: { $in: ['Unmatched', 'Possible'] } }),
        Voucher.countDocuments({ status: 'Draft', isDeleted: { $ne: true } }),
    ]);

    if (unreconciledBank > 0) {
        alerts.push({ type: 'Bank', severity: 'medium', message: `${unreconciledBank} unreconciled bank statement line(s)`, drilldown: 'bank-recon' });
    }
    if (draftVouchers > 0) {
        alerts.push({ type: 'Voucher', severity: 'low', message: `${draftVouchers} unapproved/draft voucher(s)`, drilldown: 'vouchers' });
    }

    if (sections.accounting?.trialBalanceStatus === 'mismatch') {
        alerts.push({ type: 'Accounting', severity: 'high', message: 'Trial balance mismatch detected', drilldown: 'trial-balance' });
    }

    return alerts;
}

export async function getChartData(filters) {
    const match = buildInvoiceMatch(filters);

    const [monthlySales, monthlyGp] = await Promise.all([
        SalesInvoice.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } },
                    sales: { $sum: '$totalTaxableAmount' },
                    exportSales: {
                        $sum: {
                            $cond: [
                                { $regexMatch: { input: { $ifNull: ['$customerRegistrationType', ''] }, regex: /export/i } },
                                '$totalTaxableAmount',
                                0,
                            ],
                        },
                    },
                    domesticSales: {
                        $sum: {
                            $cond: [
                                { $not: { $regexMatch: { input: { $ifNull: ['$customerRegistrationType', ''] }, regex: /export/i } } },
                                '$totalTaxableAmount',
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        SalesInvoice.aggregate([
            { $match: { ...match, totalGpAmount: { $exists: true } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } },
                    gpAmount: { $sum: '$totalGpAmount' },
                    sales: { $sum: '$totalTaxableAmount' },
                },
            },
            { $sort: { _id: 1 } },
        ]),
    ]);

    const gpQuery = {
        financialYear: filters.financialYear,
        startDate: filters.startDateStr,
        endDate: filters.endDateStr,
        customerId: filters.customerId,
        exportFilter: filters.exportFilter,
        category: filters.category,
    };

    const [productGp, customerGp, exportDomestic] = await Promise.all([
        gpAnalysis.getProductWiseGpReport(gpQuery),
        gpAnalysis.getCustomerWiseGpReport(gpQuery),
        gpAnalysis.getExportDomesticGpSummary(gpQuery),
    ]);

    return {
        monthlySalesTrend: monthlySales.map((m) => ({
            month: m._id,
            sales: r2(m.sales),
            exportSales: r2(m.exportSales),
            domesticSales: r2(m.domesticSales),
        })),
        monthlyGpTrend: monthlyGp.map((m) => ({
            month: m._id,
            gpAmount: r2(m.gpAmount),
            gpPercent: m.sales > 0 ? r2((m.gpAmount / m.sales) * 100) : 0,
        })),
        productWiseGp: productGp.slice(0, 8).map((p) => ({ name: p.itemName || p.itemCode, gp: p.gpAmount, gpPercent: p.gpPercent })),
        customerWiseGp: customerGp.slice(0, 8).map((c) => ({ name: c.customerName, gp: c.gpAmount, gpPercent: c.gpPercent })),
        exportVsDomestic: [
            { name: 'Export', sales: exportDomestic.export?.salesValue || 0, gp: exportDomestic.export?.gpAmount || 0 },
            { name: 'Domestic', sales: exportDomestic.domestic?.salesValue || 0, gp: exportDomestic.domestic?.gpAmount || 0 },
        ],
    };
}

export async function getDirectorMisDashboard(query = {}) {
    const filters = parseDirectorMisFilters(query);
    const gpQuery = {
        financialYear: filters.financialYear,
        startDate: filters.startDateStr,
        endDate: filters.endDateStr,
        customerId: filters.customerId,
        exportFilter: filters.exportFilter,
        category: filters.category,
    };

    const [accounting, sales, recovery, gp, gst, tds, msme, inventory, production, exportMis] =
        await Promise.all([
            getAccountingSummary(filters),
            getSalesSummary(filters),
            getRecoverySummary(filters),
            gpAnalysis.getDirectorGpSummary(gpQuery),
            getGstSummary(filters),
            getTdsSummary(filters),
            getMsmePayableSummary(filters),
            getInventorySummary(),
            getProductionSummary(filters),
            getExportMis(filters),
        ]);

    const [charts, compliance] = await Promise.all([
        getChartData(filters),
        getComplianceAlerts(filters, { accounting, gst, tds, msme, inventory, gp }),
    ]);

    return {
        filters: {
            financialYear: filters.financialYear,
            startDate: filters.startDateStr,
            endDate: filters.endDateStr,
            customerId: filters.customerId,
            category: filters.category,
            exportFilter: filters.exportFilter,
            branch: filters.branch,
        },
        generatedAt: new Date(),
        accounting,
        sales,
        recovery,
        gp,
        gst,
        tds,
        msme,
        inventory,
        production,
        exportMis,
        compliance,
        charts,
    };
}

export { AGE_BUCKETS };
