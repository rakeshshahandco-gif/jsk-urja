import { BankStatementLine } from '../../models/bankStatementLine.model.js';
import { BankReconciliation } from '../../models/bankReconciliation.model.js';
import { CashBankAccount } from '../../models/cashBankAccount.model.js';
import { fetchBookLines } from './bookLines.service.js';

export async function reportSummary({ cashBankAccountId, from, to }) {
    const lineFilter = { cashBankAccountId };
    if (from || to) {
        lineFilter.txnDate = {};
        if (from) lineFilter.txnDate.$gte = new Date(from);
        if (to) lineFilter.txnDate.$lte = new Date(to);
    }

    const bankLines = await BankStatementLine.find(lineFilter).lean();
    const byStatus = {};
    for (const l of bankLines) {
        byStatus[l.matchStatus] = (byStatus[l.matchStatus] || 0) + 1;
    }

    const approved = await BankReconciliation.countDocuments({
        cashBankAccountId,
        status: 'Approved',
        isUndone: false,
    });

    const bookLines = await fetchBookLines({ cashBankAccountId, from, to });
    const unreconciledBook = bookLines.filter((b) => !b.reconciled).length;

    return {
        bankLineCount: bankLines.length,
        byStatus,
        approvedMatchCount: approved,
        bookLineCount: bookLines.length,
        unreconciledBookCount: unreconciledBook,
        unreconciledBankCount: bankLines.filter((b) => b.matchStatus === 'Unmatched' || b.matchStatus === 'Possible').length,
    };
}

export async function reportUnreconciled({ cashBankAccountId, from, to }) {
    const lineFilter = { cashBankAccountId, matchStatus: { $in: ['Unmatched', 'Possible'] } };
    if (from || to) {
        lineFilter.txnDate = {};
        if (from) lineFilter.txnDate.$gte = new Date(from);
        if (to) lineFilter.txnDate.$lte = new Date(to);
    }
    const bankOnly = await BankStatementLine.find(lineFilter).sort({ txnDate: -1 }).limit(500).lean();
    const bookLines = await fetchBookLines({ cashBankAccountId, from, to });
    const bookOnly = bookLines.filter((b) => !b.reconciled);
    return { bankOnly, bookOnly };
}

export async function reportBookVsBankBalance({ cashBankAccountId }) {
    const cb = await CashBankAccount.findById(cashBankAccountId).lean();
    if (!cb) return null;

    const bankUnmatched = await BankStatementLine.aggregate([
        { $match: { cashBankAccountId: cb._id, matchStatus: { $in: ['Unmatched', 'Possible'] } } },
        {
            $group: {
                _id: '$drCr',
                total: { $sum: '$amount' },
            },
        },
    ]);

    return {
        accountName: cb.accountName,
        bookBalance: cb.currentBalance,
        openingBalance: cb.openingBalance,
        bankUnmatchedByDirection: bankUnmatched,
        note: 'Display only — book balance is not modified by reconciliation.',
    };
}

export async function reportClearedVsPending({ cashBankAccountId, from, to }) {
    const lineFilter = { cashBankAccountId };
    if (from || to) {
        lineFilter.txnDate = {};
        if (from) lineFilter.txnDate.$gte = new Date(from);
        if (to) lineFilter.txnDate.$lte = new Date(to);
    }
    const lines = await BankStatementLine.find(lineFilter).lean();
    let cleared = 0;
    let pending = 0;
    for (const l of lines) {
        if (l.matchStatus === 'Reconciled') cleared += l.amount;
        else if (l.matchStatus === 'Unmatched' || l.matchStatus === 'Possible') pending += l.amount;
    }
    return { clearedAmount: cleared, pendingAmount: pending, totalLines: lines.length };
}

export async function reportDateWise({ cashBankAccountId, from, to }) {
    const match = { cashBankAccountId };
    if (from || to) {
        match.txnDate = {};
        if (from) match.txnDate.$gte = new Date(from);
        if (to) match.txnDate.$lte = new Date(to);
    }
    return BankStatementLine.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$txnDate' } },
                count: { $sum: 1 },
                reconciled: {
                    $sum: { $cond: [{ $eq: ['$matchStatus', 'Reconciled'] }, 1, 0] },
                },
                amount: { $sum: '$amount' },
            },
        },
        { $sort: { _id: 1 } },
    ]);
}

export async function reportManualAdjustments({ cashBankAccountId, from, to }) {
    const q = { cashBankAccountId, matchKind: 'Manual', status: 'Approved', isUndone: false };
    if (from || to) {
        q.createdAt = {};
        if (from) q.createdAt.$gte = new Date(from);
        if (to) q.createdAt.$lte = new Date(to);
    }
    return BankReconciliation.find(q).sort({ createdAt: -1 }).limit(500).lean();
}

export async function reportBankCharges({ cashBankAccountId, from, to }) {
    const q = { cashBankAccountId, matchStatus: 'BankCharge' };
    if (from || to) {
        q.txnDate = {};
        if (from) q.txnDate.$gte = new Date(from);
        if (to) q.txnDate.$lte = new Date(to);
    }
    return BankStatementLine.find(q).sort({ txnDate: -1 }).lean();
}

export async function reportImportHistory({ cashBankAccountId, limit = 100 }) {
    const { BankStatementImport } = await import('../../models/bankStatementImport.model.js');
    const q = {};
    if (cashBankAccountId) q.cashBankAccountId = cashBankAccountId;
    return BankStatementImport.find(q).sort({ createdAt: -1 }).limit(Number(limit) || 100).lean();
}

export async function reportReconciliationStatement({ cashBankAccountId, from, to }) {
    const bookLines = await fetchBookLines({ cashBankAccountId, from, to });
    const lineFilter = { cashBankAccountId };
    if (from || to) {
        lineFilter.txnDate = {};
        if (from) lineFilter.txnDate.$gte = new Date(from);
        if (to) lineFilter.txnDate.$lte = new Date(to);
    }

    const bankLines = await BankStatementLine.find(lineFilter).lean();
    const reconciled = await BankReconciliation.find({
        cashBankAccountId,
        status: 'Approved',
        isUndone: false,
    }).lean();

    const bookUnreconciled = bookLines.filter((b) => !b.reconciled);
    const bankUnmatched = bankLines.filter((b) =>
        ['Unmatched', 'Suggested', 'Possible', 'AutoMatched', 'Rejected'].includes(b.matchStatus),
    );

    return {
        period: { from, to },
        book: {
            totalLines: bookLines.length,
            unreconciledCount: bookUnreconciled.length,
            unreconciledAmount: bookUnreconciled.reduce((s, b) => s + (b.openAmount ?? b.amount), 0),
        },
        bank: {
            totalLines: bankLines.length,
            unmatchedCount: bankUnmatched.length,
            unmatchedAmount: bankUnmatched.reduce((s, b) => s + b.amount, 0),
        },
        reconciledMatchCount: reconciled.length,
        reconciledAmount: reconciled.reduce((s, r) => s + (r.allocatedAmount || 0), 0),
        note: 'Reconciliation statement is informational; ledger balances are unchanged.',
    };
}
