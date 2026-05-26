import { Budget } from '../models/budget.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';

export async function getBudgetVsActual({ budgetId, startDate, endDate }) {
    const budget = await Budget.findById(budgetId).lean();
    if (!budget) throw new Error('Budget not found');

    const ledgerIds = budget.lines.map(l => l.ledgerId);

    const actuals = await LedgerEntry.aggregate([
        {
            $match: {
                ledgerId: { $in: ledgerIds },
                date: { $gte: new Date(startDate), $lte: new Date(endDate) },
            },
        },
        {
            $group: {
                _id: '$ledgerId',
                totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
                totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } },
            },
        },
    ]);

    const actualMap = {};
    actuals.forEach(a => { actualMap[a._id.toString()] = a; });

    const ledgers = await AccountLedger.find({ _id: { $in: ledgerIds } }).select('_id drCr').lean();
    const drCrMap = {};
    ledgers.forEach(l => { drCrMap[l._id.toString()] = l.drCr; });

    const lines = budget.lines.map(line => {
        const a = actualMap[line.ledgerId.toString()] || { totalDebit: 0, totalCredit: 0 };
        const drCr = drCrMap[line.ledgerId.toString()] || 'Dr';
        const actualAmount = drCr === 'Dr' ? a.totalDebit : a.totalCredit;
        const variance = line.budgetedAmount - actualAmount;
        const variancePct = line.budgetedAmount > 0 ? +((variance / line.budgetedAmount) * 100).toFixed(2) : 0;
        return {
            ledgerId: line.ledgerId,
            ledgerName: line.ledgerName,
            costCenterName: line.costCenterName || '',
            budgetedAmount: line.budgetedAmount,
            actualAmount: +actualAmount.toFixed(2),
            variance: +variance.toFixed(2),
            variancePct,
            status: variance >= 0 ? 'Under Budget' : 'Over Budget',
        };
    });

    const totalBudgeted = lines.reduce((s, l) => s + l.budgetedAmount, 0);
    const totalActual = lines.reduce((s, l) => s + l.actualAmount, 0);

    return {
        budget: {
            _id: budget._id,
            name: budget.name,
            financialYear: budget.financialYear,
            type: budget.type,
            period: budget.period,
        },
        lines,
        totals: {
            budgeted: totalBudgeted,
            actual: totalActual,
            variance: totalBudgeted - totalActual,
        },
    };
}
