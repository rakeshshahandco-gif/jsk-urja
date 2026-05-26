import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';

/**
 * Indirect Method Cash Flow Statement.
 *
 * Three sections:
 *   A. Operating Activities  — starts with Net Profit, adds back non-cash items,
 *                              adjusts for working capital changes
 *   B. Investing Activities  — Fixed asset purchases / disposals, investments
 *   C. Financing Activities  — Loans raised/repaid, capital introduced/withdrawn, dividends
 */
export async function getCashFlowStatement({ startDate, endDate }) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const allLedgers = await AccountLedger.find({}).lean();
    const allGroups = await AccountGroup.find({}).lean();
    const groupMap = {};
    allGroups.forEach(g => { groupMap[g._id.toString()] = g; });

    // Aggregate entries for the period
    const periodEntries = await LedgerEntry.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$ledgerId',
                debit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
                credit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } },
            },
        },
    ]);

    const periodMap = {};
    periodEntries.forEach(e => {
        periodMap[e._id.toString()] = { debit: e.debit, credit: e.credit, net: e.debit - e.credit };
    });

    // Opening balances (all entries BEFORE startDate)
    const openingEntries = await LedgerEntry.aggregate([
        { $match: { date: { $lt: start } } },
        {
            $group: {
                _id: '$ledgerId',
                debit: { $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', 0] } },
                credit: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', 0] } },
            },
        },
    ]);

    const openingMap = {};
    openingEntries.forEach(e => {
        openingMap[e._id.toString()] = { debit: e.debit, credit: e.credit, net: e.debit - e.credit };
    });

    // Helper to get closing balance of a ledger at a point in time
    const closingBalance = (ledger, map) => {
        const ob = ledger.drCr === 'Cr' ? -(ledger.openingBalance || 0) : (ledger.openingBalance || 0);
        const m = map[ledger._id.toString()] || { net: 0 };
        return ob + m.net;
    };

    // Classify each ledger
    const section = (ledger) => {
        const grp = ledger.underGroup ? groupMap[ledger.underGroup.toString()] : null;
        const gName = (grp?.name || '').toLowerCase();
        const lName = (ledger.name || '').toLowerCase();

        // Investing — Fixed Assets
        if (gName.includes('fixed asset') || gName.includes('capital work') || ledger.isFixedAsset) return 'investing';
        // Investing — Investments
        if (gName.includes('investment')) return 'investing';
        // Financing — Loans
        if (gName.includes('loan') || gName.includes('term loan') || gName.includes('secured') || gName.includes('unsecured')) return 'financing';
        // Financing — Capital
        if (gName.includes('capital account') || gName.includes("owner") || gName.includes('equity') || gName.includes('share capital')) return 'financing';
        // Financing — Reserves
        if (gName.includes('reserve')) return 'financing';
        // Cash & Bank — excluded from working capital
        if (ledger.type === 'Cash' || ledger.type === 'Bank' || gName.includes('cash') || gName.includes('bank')) return 'cash';
        // P&L items (Income / Expense) handled separately
        if (grp?.nature === 'Income' || grp?.nature === 'Expenses') return 'pl';
        // Everything else = working capital (operating)
        return 'operating_wc';
    };

    // Opening & closing cash
    const cashLedgers = allLedgers.filter(l => section(l) === 'cash');
    const openingCash = cashLedgers.reduce((s, l) => s + closingBalance(l, openingMap), 0);
    const closingCash = cashLedgers.reduce((s, l) => s + closingBalance(l, {
        ...openingMap,
        [l._id.toString()]: {
            net: (openingMap[l._id.toString()]?.net || 0) + (periodMap[l._id.toString()]?.net || 0),
        },
    }), 0);

    // Net Profit for the period (sum of P&L ledger movements)
    let netProfit = 0;
    allLedgers.forEach(l => {
        if (section(l) !== 'pl') return;
        const grp = l.underGroup ? groupMap[l.underGroup.toString()] : null;
        const pm = periodMap[l._id.toString()] || { debit: 0, credit: 0 };
        if (grp?.nature === 'Income') netProfit += pm.credit - pm.debit;
        if (grp?.nature === 'Expenses') netProfit -= pm.debit - pm.credit;
    });

    // Working Capital changes (Operating)
    const workingCapitalItems = [];
    allLedgers.forEach(l => {
        if (section(l) !== 'operating_wc') return;
        const ob = closingBalance(l, openingMap);
        const cb = closingBalance(l, {
            [l._id.toString()]: {
                net: (openingMap[l._id.toString()]?.net || 0) + (periodMap[l._id.toString()]?.net || 0),
            },
        });
        const change = cb - ob;
        if (Math.abs(change) < 0.01) return;
        // For liabilities (credit normal): increase = cash inflow (+); for assets: increase = outflow (-)
        const grp = l.underGroup ? groupMap[l.underGroup.toString()] : null;
        const isLiability = grp?.nature === 'Liabilities';
        const cfImpact = isLiability ? change : -change;
        workingCapitalItems.push({ name: l.name, opening: ob, closing: cb, change, cfImpact });
    });

    const operatingTotal = netProfit + workingCapitalItems.reduce((s, i) => s + i.cfImpact, 0);

    // Investing activities
    const investingItems = [];
    allLedgers.forEach(l => {
        if (section(l) !== 'investing') return;
        const ob = closingBalance(l, openingMap);
        const cb = closingBalance(l, {
            [l._id.toString()]: { net: (openingMap[l._id.toString()]?.net || 0) + (periodMap[l._id.toString()]?.net || 0) },
        });
        const change = cb - ob;
        if (Math.abs(change) < 0.01) return;
        investingItems.push({ name: l.name, opening: ob, closing: cb, change, cfImpact: -change });
    });

    const investingTotal = investingItems.reduce((s, i) => s + i.cfImpact, 0);

    // Financing activities
    const financingItems = [];
    allLedgers.forEach(l => {
        if (section(l) !== 'financing') return;
        const ob = closingBalance(l, openingMap);
        const cb = closingBalance(l, {
            [l._id.toString()]: { net: (openingMap[l._id.toString()]?.net || 0) + (periodMap[l._id.toString()]?.net || 0) },
        });
        const change = cb - ob;
        if (Math.abs(change) < 0.01) return;
        const grp = l.underGroup ? groupMap[l.underGroup.toString()] : null;
        const isLiability = grp?.nature === 'Liabilities';
        const cfImpact = isLiability ? change : -change;
        financingItems.push({ name: l.name, opening: ob, closing: cb, change, cfImpact });
    });

    const financingTotal = financingItems.reduce((s, i) => s + i.cfImpact, 0);

    const netChange = operatingTotal + investingTotal + financingTotal;

    return {
        period: { startDate, endDate },
        openingCash: +openingCash.toFixed(2),
        closingCash: +closingCash.toFixed(2),
        netChange: +netChange.toFixed(2),
        operating: {
            netProfit: +netProfit.toFixed(2),
            workingCapitalItems: workingCapitalItems.map(i => ({ ...i, cfImpact: +i.cfImpact.toFixed(2) })),
            total: +operatingTotal.toFixed(2),
        },
        investing: {
            items: investingItems.map(i => ({ ...i, cfImpact: +i.cfImpact.toFixed(2) })),
            total: +investingTotal.toFixed(2),
        },
        financing: {
            items: financingItems.map(i => ({ ...i, cfImpact: +i.cfImpact.toFixed(2) })),
            total: +financingTotal.toFixed(2),
        },
    };
}
