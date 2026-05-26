import mongoose from 'mongoose';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { CashBankAccount } from '../models/cashBankAccount.model.js';
import { postLedgerEntry } from '../utils/ledgerDispatcher.js';
import logger from '../utils/logger.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveBankCashLedgerId(payment) {
    if (payment.paymentMode === 'Cash') {
        const cashLed = await AccountLedger.findOne({ isCashLedger: true });
        if (cashLed) return cashLed._id;
        const cba = await CashBankAccount.findOne({ accountType: 'Cash' }).populate('ledgerId');
        if (cba?.ledgerId) return cba.ledgerId;
        return null;
    }
    const name = (payment.fromAccount || payment.bankName || '').trim();
    if (name) {
        const byName = await CashBankAccount.findOne({
            accountName: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        }).populate('ledgerId');
        if (byName?.ledgerId) return byName.ledgerId;
    }
    return null;
}

/**
 * Best-effort balanced voucher: Dr Vendor (gross), Cr TDS Payable, Cr Bank/Cash (net).
 * Skips if ledgers missing — does not throw (caller logs).
 */
export async function postTdsWithholdingForPayment(paymentDoc, vendorLedgerId, userId) {
    const tdsAmt = Number(paymentDoc.tdsAmount || 0);
    if (!(tdsAmt > 0) || paymentDoc.paymentStatus !== 'Completed') {
        return { status: 'skipped', note: 'No TDS or payment not completed' };
    }
    if (paymentDoc.tdsPostingVoucherId) {
        return { status: 'skipped', note: 'Already posted' };
    }

    const vendorLedger = vendorLedgerId ? await AccountLedger.findById(vendorLedgerId) : null;
    const tdsPayable = await AccountLedger.findOne({ name: 'TDS Payable' });
    const bankLedgerId = await resolveBankCashLedgerId(paymentDoc);

    if (!vendorLedger) {
        return { status: 'skipped', note: 'Vendor ledger not found' };
    }
    if (!tdsPayable) {
        return { status: 'skipped', note: "System ledger 'TDS Payable' not found — run accounting initialization" };
    }
    if (!bankLedgerId) {
        return { status: 'skipped', note: 'Could not resolve cash/bank ledger from payment instrument (match Cash/Bank master account name to fromAccount)' };
    }

    const gross =
        paymentDoc.tdsBaseAmount > 0
            ? Number(paymentDoc.tdsBaseAmount)
            : r2(Number(paymentDoc.amountPaid) + tdsAmt);
    const net = Number(paymentDoc.amountPaid);
    if (r2(gross - tdsAmt) !== net && Math.abs(r2(gross - tdsAmt) - net) > 0.02) {
        return { status: 'skipped', note: 'Gross / TDS / net amounts do not reconcile — check tdsBaseAmount vs amountPaid' };
    }

    let vType = await VoucherType.findOne({ nature: 'Payment' });
    if (!vType) {
        vType = await VoucherType.findOne({ nature: 'Journal' });
    }
    if (!vType) {
        return { status: 'skipped', note: 'No Payment/Journal voucher type in system' };
    }

    const voucherNo = `PMT-TDS-${String(paymentDoc._id).slice(-10)}`;
    const date = paymentDoc.paymentDate || new Date();
    const fy = paymentDoc.financialYear || '';

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const voucherArr = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    nature: vType.nature || 'Payment',
                    date,
                    partyId: vendorLedger._id,
                    partyName: vendorLedger.name,
                    totalAmount: gross,
                    narration: `TDS ${paymentDoc.tdsSection || ''} on vendor payment`,
                    isSystemGenerated: true,
                    createdBy: userId,
                    status: 'Confirmed',
                    financialYear: fy,
                },
            ],
            { session },
        );
        const vId = voucherArr[0]._id;

        await postLedgerEntry(
            {
                voucherId: vId,
                voucherNo,
                date,
                ledgerId: vendorLedger._id,
                amount: gross,
                type: 'Debit',
                narration: `Vendor payment gross (${paymentDoc.tdsSection || 'TDS'})`,
                financialYear: fy,
            },
            session,
        );
        await postLedgerEntry(
            {
                voucherId: vId,
                voucherNo,
                date,
                ledgerId: tdsPayable._id,
                amount: tdsAmt,
                type: 'Credit',
                narration: 'TDS withheld',
                financialYear: fy,
            },
            session,
        );
        await postLedgerEntry(
            {
                voucherId: vId,
                voucherNo,
                date,
                ledgerId: bankLedgerId,
                amount: net,
                type: 'Credit',
                narration: 'Net paid (bank/cash)',
                financialYear: fy,
            },
            session,
        );

        await session.commitTransaction();
        return { status: 'posted', voucherId: vId, voucherNo };
    } catch (e) {
        await session.abortTransaction();
        logger.error('[TDS payment posting]', e);
        return { status: 'skipped', note: e.message || 'Ledger posting failed' };
    } finally {
        session.endSession();
    }
}
