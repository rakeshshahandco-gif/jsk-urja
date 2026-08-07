/**
 * Build ledger/group balances with group resolved per LedgerEntry.date
 * (not merely report period-end). Supports mid-FY group changes via groupHistory.
 */
import { AccountGroup } from '../../models/accountGroup.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { LedgerEntry } from '../../models/ledgerEntry.model.js';
import { resolveLedgerGroupAtDate } from './ledgerGroupHistory.js';

function bucketKey(ledgerId, groupId) {
    return `${String(ledgerId)}::${groupId ? String(groupId) : 'unmapped'}`;
}

/**
 * @param {Date|null} startDate - when set, only entries in [start, end] (period reports)
 * @param {Date} endDate
 * @param {{ includeOpeningBalance?: boolean }} opts
 *   includeOpeningBalance defaults to true when startDate is null (BS/TB as-of),
 *   false when startDate is set (period P&L movements).
 */
export async function getLedgerBalancesByEntryGroup(startDate, endDate, opts = {}) {
    const ledgers = await AccountLedger.find({}).lean();
    const groups = await AccountGroup.find({}).lean();
    const groupMap = {};
    groups.forEach((g) => {
        groupMap[g._id.toString()] = g;
    });

    const ledgerMap = {};
    ledgers.forEach((l) => {
        ledgerMap[l._id.toString()] = l;
    });

    const end = endDate ? new Date(endDate) : new Date();
    const match = { date: { $lte: end } };
    if (startDate) {
        match.date.$gte = new Date(startDate);
    }

    const includeOpeningBalance =
        opts.includeOpeningBalance !== undefined
            ? Boolean(opts.includeOpeningBalance)
            : !startDate;

    const entries = await LedgerEntry.find(match)
        .select('ledgerId date amount type')
        .lean();

    /** @type {Map<string, object>} */
    const buckets = new Map();

    const ensureBucket = (ledger, groupId, groupNameHint) => {
        const gid = groupId ? String(groupId) : null;
        const key = bucketKey(ledger._id, gid);
        if (!buckets.has(key)) {
            const group = gid ? groupMap[gid] : null;
            buckets.set(key, {
                ledgerId: ledger._id,
                _id: ledger._id,
                name: ledger.name,
                underGroup: groupId || ledger.underGroup,
                groupId: groupId || ledger.underGroup || null,
                groupName: groupNameHint || group?.name || ledger.groupName || 'Unmapped',
                nature: group?.nature || 'General',
                affectGrossProfit: group?.affectGrossProfit || false,
                openingBalance: 0,
                totalDebit: 0,
                totalCredit: 0,
                closingBalance: 0,
                absBalance: 0,
                balanceType: 'Debit',
                groupResolveSource: 'entryDate',
            });
        }
        return buckets.get(key);
    };

    // Opening balance attributed to group as-of startDate (or epoch / earliest history)
    if (includeOpeningBalance) {
        const obAsOf = startDate ? new Date(startDate) : new Date(0);
        for (const l of ledgers) {
            const signedOb = l.drCr === 'Cr' ? -(l.openingBalance || 0) : l.openingBalance || 0;
            if (!signedOb) continue;
            const resolved = resolveLedgerGroupAtDate(l, obAsOf);
            const b = ensureBucket(l, resolved.groupId, resolved.groupName);
            b.openingBalance += signedOb;
            b.groupResolveSource = resolved.source === 'groupHistory' ? 'opening+history' : 'opening+current';
        }
    }

    for (const e of entries) {
        const lid = e.ledgerId ? String(e.ledgerId) : '';
        const l = ledgerMap[lid];
        if (!l) continue;
        const resolved = resolveLedgerGroupAtDate(l, e.date);
        const b = ensureBucket(l, resolved.groupId, resolved.groupName);
        const amt = Number(e.amount) || 0;
        if (e.type === 'Debit') b.totalDebit += amt;
        else b.totalCredit += amt;
    }

    const ledgerReports = [];
    for (const b of buckets.values()) {
        b.closingBalance = b.openingBalance + b.totalDebit - b.totalCredit;
        b.absBalance = Math.abs(b.closingBalance);
        b.balanceType = b.closingBalance >= 0 ? 'Debit' : 'Credit';
        ledgerReports.push(b);
    }

    // Also include ledgers with zero activity so TB lists stay complete when includeOpeningBalance
    if (includeOpeningBalance) {
        const seen = new Set(ledgerReports.map((r) => String(r.ledgerId)));
        for (const l of ledgers) {
            if (seen.has(String(l._id))) continue;
            const resolved = resolveLedgerGroupAtDate(l, end);
            const group = resolved.groupId ? groupMap[String(resolved.groupId)] : null;
            ledgerReports.push({
                ledgerId: l._id,
                _id: l._id,
                name: l.name,
                underGroup: resolved.groupId || l.underGroup,
                groupId: resolved.groupId || l.underGroup,
                groupName: resolved.groupName || group?.name || l.groupName || 'Unmapped',
                nature: group?.nature || 'General',
                affectGrossProfit: group?.affectGrossProfit || false,
                openingBalance: 0,
                totalDebit: 0,
                totalCredit: 0,
                closingBalance: 0,
                absBalance: 0,
                balanceType: 'Debit',
                groupResolveSource: resolved.source,
            });
        }
    }

    const groupTotals = {};
    for (const l of ledgerReports) {
        const key = (l.groupId || l.groupName || 'Unmapped').toString();
        if (!groupTotals[key]) {
            groupTotals[key] = {
                groupId: l.groupId,
                groupName: l.groupName,
                nature: l.nature,
                affectGrossProfit: l.affectGrossProfit,
                total: 0,
            };
        }
        groupTotals[key].total += l.closingBalance;
    }

    return {
        ledgerReports,
        groups: Object.values(groupTotals),
    };
}
