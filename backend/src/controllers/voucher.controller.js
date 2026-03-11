import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { CashBankAccount } from '../models/cashBankAccount.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';

/**
 * Generate Next Voucher Number
 */
const getNextVoucherNo = async (typeId) => {
    const vType = await VoucherType.findById(typeId);
    if (!vType) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

    const num = vType.nextNumber;
    const vNo = `${vType.prefix}${String(num).padStart(4, '0')}`;

    vType.nextNumber += 1;
    await vType.save();
    return vNo;
};

/**
 * Post to Ledger and update balances
 */
const postToLedger = async (data, session) => {
    const { voucherId, voucherNo, date, ledgerId, amount, type, narration, cashBankAccountId } = data;

    const ledger = await AccountLedger.findById(ledgerId).session(session);
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, `Ledger ${ledgerId} not found`);

    // Create Ledger Entry
    await LedgerEntry.create([{
        voucherId, voucherNo, date, ledgerId, ledgerName: ledger.name,
        amount, type, narration, cashBankAccountId
    }], { session });

    // Update Ledger Balance
    // Debit increases Asset/Expense, Credit increases Liability/Income
    // For simplicity, let's just track a net balance: Debit is +, Credit is -
    const change = type === 'Debit' ? amount : -amount;
    ledger.currentBalance += change;
    await ledger.save({ session });

    // If it's a Cash/Bank Ledger, update the CashBankAccount master
    if (cashBankAccountId) {
        const cbAcc = await CashBankAccount.findById(cashBankAccountId).session(session);
        if (cbAcc) {
            cbAcc.currentBalance += change;
            await cbAcc.save({ session });
        }
    }
};

/**
 * Update Invoice Payment Status
 */
const adjustBill = async (adj, nature, session) => {
    const { refId, amount, adjustmentType } = adj;
    if (!refId || adjustmentType !== 'Against Bill') return;

    if (nature === 'Receipt') {
        const invoice = await SalesInvoice.findById(refId).session(session);
        if (invoice) {
            invoice.paidAmount += amount;
            if (invoice.paidAmount >= invoice.roundedTotal) invoice.paymentStatus = 'Paid';
            else if (invoice.paidAmount > 0) invoice.paymentStatus = 'Partially Paid';
            await invoice.save({ session });
        }
    } else if (nature === 'Payment') {
        const invoice = await PurchaseInvoice.findById(refId).session(session);
        if (invoice) {
            invoice.paidAmount += amount;
            if (invoice.paidAmount >= invoice.grandTotal) invoice.paymentStatus = 'Paid';
            else if (invoice.paidAmount > 0) invoice.paymentStatus = 'Partially Paid';
            await invoice.save({ session });
        }
    }
};

export const createVoucher = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { voucherTypeId, date, cashBankAccountId, partyId, totalAmount, items, narration, instrumentType, instrumentNo, nature } = req.body;

        const vType = await VoucherType.findById(voucherTypeId).session(session);
        if (!vType) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

        const voucherNo = await getNextVoucherNo(voucherTypeId);

        const voucher = new Voucher({
            ...req.body,
            voucherNo,
            nature: vType.nature,
            voucherTypeName: vType.name,
            createdBy: req.user.id
        });

        await voucher.save({ session });

        // 1. Post Main Account (Cash/Bank)
        // Receipt: Debit Bank/Cash, Credit Party
        // Payment: Credit Bank/Cash, Debit Party
        const mainLedger = await AccountLedger.findOne({ referenceId: cashBankAccountId }).session(session);
        if (!mainLedger) throw new ApiError(httpStatus.BAD_REQUEST, 'Main account ledger not found');

        await postToLedger({
            voucherId: voucher._id, voucherNo, date,
            ledgerId: mainLedger._id, amount: totalAmount,
            type: vType.nature === 'Receipt' ? 'Debit' : 'Credit',
            narration: narration || `Main entry for ${voucherNo}`,
            cashBankAccountId
        }, session);

        // 2. Post Item Entries (Parties / Expenses / Incomes)
        for (const item of items) {
            await postToLedger({
                voucherId: voucher._id, voucherNo, date,
                ledgerId: item.ledgerId, amount: item.amount,
                type: item.type, // e.g., Credit for Receipt, Debit for Payment
                narration: item.narration || narration
            }, session);

            // 3. Handle Bill Adjustments
            if (item.adjustments && item.adjustments.length > 0) {
                for (const adj of item.adjustments) {
                    await adjustBill(adj, vType.nature, session);
                }
            }
        }

        await session.commitTransaction();
        res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, voucher, 'Voucher created successfully'));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const getVouchers = asyncHandler(async (req, res) => {
    const { from, to, nature, natureType, partyId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }
    if (nature) filter.nature = nature;
    if (partyId) filter.partyId = partyId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        Voucher.find(filter).sort({ date: -1, voucherNo: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        Voucher.countDocuments(filter)
    ]);

    res.send(new ApiResponse(httpStatus.OK, { data, meta: { total, page: parseInt(page), limit: parseInt(limit) } }));
});

export const getVoucher = asyncHandler(async (req, res) => {
    const voucher = await Voucher.findById(req.params.id).populate('items.ledgerId').lean();
    if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
    res.send(new ApiResponse(httpStatus.OK, voucher));
});

export const cancelVoucher = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const voucher = await Voucher.findById(req.params.id).session(session);
        if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
        if (voucher.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher already cancelled');

        // Reverse Ledger Entries
        // Instead of deleting, we could create reverse entries or just mark them as cancelled.
        // For simple balance management, let's reverse the effects.

        const entries = await LedgerEntry.find({ voucherId: voucher._id }).session(session);
        for (const entry of entries) {
            const ledger = await AccountLedger.findById(entry.ledgerId).session(session);
            // Reverse balance logic: if it was Debit (+), subtract. if Credit (-), add.
            const reverseChange = entry.type === 'Debit' ? -entry.amount : entry.amount;
            ledger.currentBalance += reverseChange;
            await ledger.save({ session });

            if (entry.cashBankAccountId) {
                const cbAcc = await CashBankAccount.findById(entry.cashBankAccountId).session(session);
                if (cbAcc) {
                    cbAcc.currentBalance += reverseChange;
                    await cbAcc.save({ session });
                }
            }
        }

        // Reverse Bill DNA (Adjustments)
        for (const item of voucher.items) {
            for (const adj of item.adjustments) {
                if (adj.adjustmentType === 'Against Bill') {
                    if (voucher.nature === 'Receipt') {
                        const invoice = await SalesInvoice.findById(adj.refId).session(session);
                        if (invoice) {
                            invoice.paidAmount -= adj.amount;
                            if (invoice.paidAmount <= 0) invoice.paymentStatus = 'Unpaid';
                            else invoice.paymentStatus = 'Partially Paid';
                            await invoice.save({ session });
                        }
                    } else if (voucher.nature === 'Payment') {
                        const invoice = await PurchaseInvoice.findById(adj.refId).session(session);
                        if (invoice) {
                            invoice.paidAmount -= adj.amount;
                            if (invoice.paidAmount <= 0) invoice.paymentStatus = 'Unpaid';
                            else invoice.paymentStatus = 'Partially Paid';
                            await invoice.save({ session });
                        }
                    }
                }
            }
        }

        voucher.status = 'Cancelled';
        await voucher.save({ session });

        await session.commitTransaction();
        res.send(new ApiResponse(httpStatus.OK, null, 'Voucher cancelled successfully'));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
