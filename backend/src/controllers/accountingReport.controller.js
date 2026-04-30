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

    const filters = { 
        isDeleted: { $ne: true },
        status: { $nin: ['Cancelled', 'Draft'] } // Only confirmed/posted sales
    };
    
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
                
                // 1. Normal Sales (Tax Invoice, not Sample, not Replacement)
                normalQty: { 
                    $sum: { 
                        $cond: [
                            { $and: [
                                { $eq: [{ $ifNull: ['$orderCategory', 'Order'] }, 'Order'] },
                                { $ne: ['$documentType', 'Estimate'] },
                                { $ne: ['$orderCategory', 'Replacement'] }
                            ]},
                            '$items.qty', 
                            0
                        ] 
                    } 
                },

                // 2. Sample Sales
                sampleQty: { 
                    $sum: { 
                        $cond: [{ $eq: ['$orderCategory', 'Sample'] }, '$items.qty', 0] 
                    } 
                },

                // 3. Estimate Sales
                estimateQty: { 
                    $sum: { 
                        $cond: [{ $eq: ['$documentType', 'Estimate'] }, '$items.qty', 0] 
                    } 
                },

                // 4. Replacement (Separate)
                replacementQty: { 
                    $sum: { 
                        $cond: [{ $eq: ['$orderCategory', 'Replacement'] }, '$items.qty', 0] 
                    } 
                },

                // Total Revenue only from Sales/Sample/Estimate
                totalRevenue: { 
                    $sum: {
                        $cond: [
                            { $ne: ['$orderCategory', 'Replacement'] },
                            {
                                $cond: [
                                    { $gt: ['$items.taxableAmount', 0] },
                                    '$items.taxableAmount',
                                    { 
                                        $cond: [
                                            { $gt: ['$items.rate', 0] },
                                            { $subtract: [{ $multiply: ['$items.qty', '$items.rate'] }, { $ifNull: ['$items.discountAmount', 0] }] },
                                            0
                                        ]
                                    }
                                ]
                            },
                            0
                        ]
                    }
                },

                uom: { $first: '$items.uom' },
                invoices: {
                    $push: {
                        invoiceNumber: '$invoiceNumber',
                        invoiceDate: '$invoiceDate',
                        customerName: '$customerName',
                        itemName: '$items.itemName',
                        additionalNotes: { $ifNull: ['$items.additionalNotes', ''] },
                        qty: '$items.qty',
                        rate: '$items.rate',
                        taxableAmount: {
                            $cond: [
                                { $gt: ['$items.taxableAmount', 0] },
                                '$items.taxableAmount',
                                { 
                                    $cond: [
                                        { $gt: ['$items.rate', 0] },
                                        { $subtract: [{ $multiply: ['$items.qty', '$items.rate'] }, { $ifNull: ['$items.discountAmount', 0] }] },
                                        0
                                    ]
                                }
                            ]
                        },
                        cgstAmount: { $ifNull: ['$items.cgstAmount', 0] },
                        sgstAmount: { $ifNull: ['$items.sgstAmount', 0] },
                        igstAmount: { $ifNull: ['$items.igstAmount', 0] },
                        totalAmount: { $ifNull: ['$items.totalAmount', 0] },
                        orderCategory: { $ifNull: ['$orderCategory', 'Order'] },
                        documentType: { $ifNull: ['$documentType', 'Tax Invoice'] }
                    }
                }
            }
        },
        {
            $addFields: {
                totalSalesQty: { $add: ['$normalQty', '$sampleQty', '$estimateQty'] },
                avgRate: { 
                    $cond: [
                        { $gt: [{ $add: ['$normalQty', '$sampleQty', '$estimateQty'] }, 0] }, 
                        { $divide: ['$totalRevenue', { $add: ['$normalQty', '$sampleQty', '$estimateQty'] }] }, 
                        0 
                    ] 
                }
            }
        },
        { $sort: { totalRevenue: -1 } }
    ]);

    // Fetch Costs for each product
    const report = [];
    for (const item of salesData) {
        let unitCost = 0;
        let costSource = 'Cost Missing';
        let costDetails = {};

        if (item._id) {
            const itemMaster = await Item.findById(item._id).lean();
            
            // 1. Try Default BOM (Highest Priority)
            const defaultBOM = await BOM.findOne({ finishedProductId: item._id, isDefault: true }).lean();
            
            if (defaultBOM) {
                unitCost = defaultBOM.finalProductionCostPerUnit || 0;
                costSource = 'BOM Final Cost';
                costDetails = {
                    bomNumber: defaultBOM.bomNumber,
                    rawMaterialCost: defaultBOM.totalRawMaterialCost,
                    processCost: defaultBOM.totalProcessCost,
                    overheadCost: defaultBOM.overheadCost,
                    labourCost: defaultBOM.labourCost,
                    pointsLabourCost: defaultBOM.totalPointsLabourCost,
                    finalCost: defaultBOM.finalProductionCostPerUnit
                };
            } 
            else if (itemMaster && itemMaster.useManualBOMCost) {
                // 2. Manual BOM Cost (If specifically enabled)
                unitCost = itemMaster.manualBOMCostPerUnit || 0;
                costSource = 'Manual GP Cost';
                costDetails = { manualCost: unitCost };
            }
            else if (itemMaster && itemMaster.valuationRate > 0) {
                // 3. Fallback to Item Master Valuation Rate (New Requirement)
                unitCost = itemMaster.valuationRate;
                costSource = 'Item Valuation Rate';
                costDetails = { valuationRate: unitCost };
            }
            else {
                // 4. No cost info found
                unitCost = 0;
                costSource = 'Cost Missing';
            }
        }

        const totalSalesQty = item.totalSalesQty || 0;
        const salesCost = totalSalesQty * unitCost;
        const replacementCost = (item.replacementQty || 0) * unitCost;
        
        const grossProfit = item.totalRevenue - salesCost;
        const gpPercent = item.totalRevenue > 0 ? (grossProfit / item.totalRevenue) * 100 : 0;

        report.push({
            ...item,
            unitCost,
            salesCost,
            replacementCost,
            grossProfit,
            gpPercent,
            costSource,
            costDetails,
            formula: 'Sales Value = Sum of (Normal + Sample + Estimate taxable value). Gross Profit = Sales Value - (Total Sales Qty * Unit Cost). Replacement cost is shown separately.'
        });
    }

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
                salesperson: sample.salesPerson || 'N/A'
            });
        }
    }

    res.send(new ApiResponse(httpStatus.OK, report, 'Sample to sales conversion report fetched'));
});
