import { CostCenter } from '../models/costCenter.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';

/**
 * Build a flat list with depth info for tree display
 */
export async function getCostCenterTree() {
    const all = await CostCenter.find({ isActive: true }).sort({ name: 1 }).lean();
    const map = {};
    all.forEach(c => { map[c._id.toString()] = { ...c, children: [] }; });

    const roots = [];
    all.forEach(c => {
        if (c.parentId) {
            const parent = map[c.parentId.toString()];
            if (parent) parent.children.push(map[c._id.toString()]);
        } else {
            roots.push(map[c._id.toString()]);
        }
    });
    return roots;
}

/**
 * Cost-Centre-wise P&L — aggregate LedgerEntry by costCenterId for a date range
 */
export async function getCostCenterPL({ startDate, endDate, costCenterId }) {
    const match = {
        date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
        },
    };
    if (costCenterId) match.costCenterId = costCenterId;

    const rows = await LedgerEntry.aggregate([
        { $match: match },
        {
            $lookup: {
                from: 'accountledgers',
                localField: 'ledgerId',
                foreignField: '_id',
                as: 'ledger',
            },
        },
        { $unwind: { path: '$ledger', preserveNullAndEmpty: true } },
        {
            $lookup: {
                from: 'accountgroups',
                localField: 'ledger.underGroup',
                foreignField: '_id',
                as: 'group',
            },
        },
        { $unwind: { path: '$group', preserveNullAndEmpty: true } },
        {
            $group: {
                _id: {
                    costCenterId: '$costCenterId',
                    costCenterName: '$costCenterName',
                    ledgerId: '$ledgerId',
                    ledgerName: '$ledgerName',
                    nature: '$group.nature',
                },
                totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
                totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } },
            },
        },
        { $sort: { '_id.costCenterName': 1, '_id.ledgerName': 1 } },
    ]);

    // Group by cost centre
    const byCC = {};
    for (const row of rows) {
        const ccId = row._id.costCenterId?.toString() || 'Unassigned';
        const ccName = row._id.costCenterName || 'Unassigned';
        if (!byCC[ccId]) byCC[ccId] = { costCenterId: ccId, costCenterName: ccName, income: [], expenses: [], totalIncome: 0, totalExpenses: 0 };

        const net = row.totalCredit - row.totalDebit;
        const entry = { ledgerName: row._id.ledgerName, debit: row.totalDebit, credit: row.totalCredit, net };

        if (row._id.nature === 'Income') {
            byCC[ccId].income.push(entry);
            byCC[ccId].totalIncome += net;
        } else if (row._id.nature === 'Expenses') {
            byCC[ccId].expenses.push(entry);
            byCC[ccId].totalExpenses += net * -1;
        }
    }

    return Object.values(byCC).map(cc => ({
        ...cc,
        netProfit: cc.totalIncome - cc.totalExpenses,
    }));
}
