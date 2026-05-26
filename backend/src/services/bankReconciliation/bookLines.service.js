import { LedgerEntry } from '../../models/ledgerEntry.model.js';
import { Voucher } from '../../models/voucher.model.js';
import { CashBankAccount } from '../../models/cashBankAccount.model.js';
import { BankReconciliation } from '../../models/bankReconciliation.model.js';
import { ledgerTypeToMovement } from './matchingEngine.js';

/**
 * Fetch bank-side book lines from LedgerEntry (+ Voucher metadata). Read-only.
 */
export async function fetchBookLines({ cashBankAccountId, from, to, financialYear }) {
    const cb = await CashBankAccount.findById(cashBankAccountId).lean();
    if (!cb) return [];

    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const or = [{ cashBankAccountId }];
    if (cb.ledgerId) or.push({ ledgerId: cb.ledgerId });

    const entryFilter = { $or: or };
    if (Object.keys(dateFilter).length) entryFilter.date = dateFilter;

    const entries = await LedgerEntry.find(entryFilter).sort({ date: -1 }).lean();
    if (!entries.length) return [];

    const voucherIds = [...new Set(entries.map((e) => String(e.voucherId)))];
    const vouchers = await Voucher.find({ _id: { $in: voucherIds }, status: { $ne: 'Cancelled' } }).lean();
    const vMap = Object.fromEntries(vouchers.map((v) => [String(v._id), v]));

    const approved = await BankReconciliation.find({
        cashBankAccountId,
        status: 'Approved',
        isUndone: false,
        bookRefId: { $in: entries.map((e) => e._id) },
    })
        .select('bookRefId bankLineId allocatedAmount')
        .lean();

    const entryAmountById = Object.fromEntries(entries.map((e) => [String(e._id), e.amount || 0]));
    const reconciledByBook = {};
    for (const r of approved) {
        const id = String(r.bookRefId);
        const alloc = r.allocatedAmount > 0 ? r.allocatedAmount : entryAmountById[id] || 0;
        reconciledByBook[id] = (reconciledByBook[id] || 0) + alloc;
    }

    return entries
        .filter((e) => {
            const v = vMap[String(e.voucherId)];
            if (!v) return false;
            if (financialYear && v.financialYear && v.financialYear !== financialYear) return false;
            return true;
        })
        .map((e) => {
            const v = vMap[String(e.voucherId)] || {};
            const amt = e.amount || 0;
            const reconciledAmount = reconciledByBook[String(e._id)] || 0;
            const openAmount = Math.max(0, amt - reconciledAmount);
            const fullyReconciled = reconciledAmount >= amt - 0.01;
            return {
                _id: e._id,
                voucherId: e.voucherId,
                voucherNo: e.voucherNo,
                date: e.date,
                amount: amt,
                openAmount,
                reconciledAmount,
                ledgerType: e.type,
                movement: ledgerTypeToMovement(e.type),
                narration: e.narration || v.narration || '',
                partyName: v.partyName || '',
                nature: v.nature || '',
                instrumentNo: v.instrumentNo || '',
                bankReference: v.bankReference || '',
                chequeNo: v.instrumentNo || '',
                reconciled: fullyReconciled,
                partiallyReconciled: reconciledAmount > 0 && !fullyReconciled,
            };
        });
}
