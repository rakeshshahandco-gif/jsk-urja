import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import moment from 'moment';

/**
 * Common Logic to Fetch All Ledger Balances for a given period
 * openingBalance + (DebitEntries - CreditEntries)
 */
const getLedgerBalances = async (startDate, endDate) => {
    const ledgers = await AccountLedger.find({}).lean();
    const groups = await AccountGroup.find({}).lean();
    
    // Group Map for quick lookup
    const groupMap = {};
    groups.forEach(g => groupMap[g._id.toString()] = g);

    // Sum of entries up to endDate
    const entries = await LedgerEntry.aggregate([
        {
            $match: {
                date: { $lte: new Date(endDate) }
            }
        },
        {
            $group: {
                _id: '$ledgerId',
                totalDebit: { 
                    $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } 
                },
                totalCredit: { 
                    $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } 
                }
            }
        }
    ]);

    const entryBalances = {};
    entries.forEach(e => {
        entryBalances[e._id.toString()] = { 
            debit: e.totalDebit, 
            credit: e.totalCredit, 
            net: e.totalDebit - e.totalCredit 
        };
    });

    // Calculate closing balances
    const ledgerReports = ledgers.map(l => {
        const stats = entryBalances[l._id.toString()] || { debit: 0, credit: 0, net: 0 };
        const signedOpeningBalance = (l.drCr === 'Cr') ? -(l.openingBalance || 0) : (l.openingBalance || 0);
        const closingBalance = signedOpeningBalance + stats.net;
        const group = l.underGroup ? groupMap[l.underGroup.toString()] : null;

        return {
            ledgerId: l._id,
            name: l.name,
            groupName: l.groupName || group?.name || 'Unmapped',
            groupId: l.underGroup,
            nature: group?.nature || 'General',
            affectGrossProfit: group?.affectGrossProfit || false,
            closingBalance,
            absBalance: Math.abs(closingBalance),
            balanceType: closingBalance >= 0 ? 'Debit' : 'Credit'
        };
    });

    return { ledgerReports, groups };
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
 * Calculates: Revenue - (Qty * Unit Cost)
 * Unit Cost is taken from Default BOM or Valuation Rate
 */
export const getProductWiseProfitability = asyncHandler(async (req, res) => {
    const { startDate, endDate, financialYear } = req.query;

    const filters = { isDeleted: { $ne: true } };
    if (financialYear) filters.financialYear = financialYear;
    if (startDate || endDate) {
        filters.invoiceDate = {};
        if (startDate) filters.invoiceDate.$gte = moment(startDate).startOf('day').toDate();
        if (endDate) filters.invoiceDate.$lte = moment(endDate).endOf('day').toDate();
    }

    // Aggregate Sales by Product
    const salesData = await SalesInvoice.aggregate([
        { $match: filters },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.itemId',
                itemCode: { $first: '$items.itemCode' },
                itemName: { $first: '$items.itemName' },
                totalQty: { $sum: '$items.qty' },
                totalRevenue: { $sum: '$items.taxableAmount' },
                avgRate: { $avg: '$items.rate' },
                uom: { $first: '$items.uom' }
            }
        },
        { $sort: { totalRevenue: -1 } }
    ]);

    // Fetch Costs for each product
    const report = [];
    for (const item of salesData) {
        let unitCost = 0;
        let costSource = 'Manual/No Cost';

        if (item._id) {
            // 1. Try Default BOM
            const defaultBOM = await BOM.findOne({ finishedProductId: item._id, isDefault: true }).lean();
            if (defaultBOM && defaultBOM.finalProductionCostPerUnit) {
                unitCost = defaultBOM.finalProductionCostPerUnit;
                costSource = `BOM (${defaultBOM.bomNumber})`;
            } else {
                // 2. Try Item Master Valuation/Purchase Rate
                const itemMaster = await Item.findById(item._id).lean();
                if (itemMaster) {
                    unitCost = itemMaster.valuationRate || itemMaster.purchaseRate || 0;
                    costSource = itemMaster.valuationRate ? 'Valuation Rate' : (itemMaster.purchaseRate ? 'Purchase Rate' : 'Item Master (No Rate)');
                }
            }
        }

        const totalCost = item.totalQty * unitCost;
        const grossProfit = item.totalRevenue - totalCost;
        const gpPercent = item.totalRevenue > 0 ? (grossProfit / item.totalRevenue) * 100 : 0;

        report.push({
            ...item,
            unitCost,
            totalCost,
            grossProfit,
            gpPercent,
            costSource
        });
    }

    res.send(new ApiResponse(httpStatus.OK, report, 'Product-wise profitability report fetched'));
});
