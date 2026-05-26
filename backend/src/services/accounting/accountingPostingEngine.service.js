import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { CashBankAccount } from '../../models/cashBankAccount.model.js';
import { LedgerEntry } from '../../models/ledgerEntry.model.js';
import {
    assertBalancedEntries,
    assertLedgersExist,
    assertGstMatchesVoucher,
    assertPostingAllowed,
} from './accountingValidation.service.js';

/**
 * Universal ledger posting — single path for voucher-linked accounting impact.
 */
export async function postAccountingEntry(data, session) {
    const {
        voucherId,
        voucherNo,
        date,
        ledgerId,
        amount,
        type,
        narration,
        cashBankAccountId,
        financialYear,
    } = data;

    const amt = Number(amount);
    if (!ledgerId || amt <= 0) return;
    if (type !== 'Debit' && type !== 'Credit') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Ledger entry type must be Debit or Credit');
    }

    const ledger = await AccountLedger.findById(ledgerId).session(session);
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, `Ledger ${ledgerId} not found`);

    await LedgerEntry.create([{
        voucherId,
        voucherNo,
        date,
        ledgerId,
        ledgerName: ledger.name,
        amount: amt,
        type,
        narration: narration || '',
        cashBankAccountId: cashBankAccountId || null,
        financialYear,
    }], { session });

    const change = type === 'Debit' ? amt : -amt;
    ledger.currentBalance += change;
    await ledger.save({ session });

    if (cashBankAccountId) {
        const cbAcc = await CashBankAccount.findById(cashBankAccountId).session(session);
        if (cbAcc) {
            cbAcc.currentBalance += change;
            await cbAcc.save({ session });
        }
    }
}

export async function postBalancedBatch({
    lines,
    voucherId,
    voucherNo,
    date,
    financialYear,
    session,
    label = 'Voucher',
    voucherGstSnapshot = null,
    adminOverride = false,
    unlockReason = '',
}) {
    await assertPostingAllowed({
        voucherDate: date,
        financialYear,
        adminOverride,
        unlockReason,
    });
    await assertLedgersExist(lines, session);
    assertBalancedEntries(lines, label);
    if (voucherGstSnapshot?.isGstEnabled) {
        assertGstMatchesVoucher(voucherGstSnapshot);
    }

    for (const line of lines) {
        await postAccountingEntry({
            voucherId,
            voucherNo,
            date,
            ledgerId: line.ledgerId,
            amount: line.amount,
            type: line.type,
            narration: line.narration || '',
            cashBankAccountId: line.cashBankAccountId || null,
            financialYear,
        }, session);
    }
}

export async function reverseLedgerEntriesForVoucher(voucher, session) {
    const entries = await LedgerEntry.find({ voucherId: voucher._id }).session(session);
    for (const entry of entries) {
        const ledger = await AccountLedger.findById(entry.ledgerId).session(session);
        if (ledger) {
            const reverseChange = entry.type === 'Debit' ? -entry.amount : entry.amount;
            ledger.currentBalance += reverseChange;
            await ledger.save({ session });
        }
        if (entry.cashBankAccountId) {
            const cbAcc = await CashBankAccount.findById(entry.cashBankAccountId).session(session);
            if (cbAcc) {
                const reverseChange = entry.type === 'Debit' ? -entry.amount : entry.amount;
                cbAcc.currentBalance += reverseChange;
                await cbAcc.save({ session });
            }
        }
    }
    await LedgerEntry.deleteMany({ voucherId: voucher._id }).session(session);
}
