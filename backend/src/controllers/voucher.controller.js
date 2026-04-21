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
import { getFYFromDate } from '../utils/fyUtils.js';

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const calculateVoucherGstTotals = (items, gstType) => {
    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    const updatedItems = items.map(item => {
        const taxableAmount = r2(item.amount); // For expenses, the base amount is the taxable
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        let gstRate = Number(item.gstRate || 0);

        if (gstRate > 0) {
            if (isIGST) {
                igstAmount = r2(taxableAmount * gstRate / 100);
            } else {
                cgstAmount = r2(taxableAmount * (gstRate / 2) / 100);
                sgstAmount = r2(taxableAmount * (gstRate / 2) / 100);
            }
        }

        totalTaxable += taxableAmount;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
            ...item,
            taxableAmount,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalAmount: r2(taxableAmount + cgstAmount + sgstAmount + igstAmount)
        };
    });

    const rawTotal = r2(totalTaxable + totalCgst + totalSgst + totalIgst);
    const grandTotal = Math.round(rawTotal);
    const roundOff = r2(grandTotal - rawTotal);

    return {
        updatedItems,
        totalTaxableAmount: r2(totalTaxable),
        totalCgst: r2(totalCgst),
        totalSgst: r2(totalSgst),
        totalIgst: r2(totalIgst),
        totalTax: r2(totalCgst + totalSgst + totalIgst),
        roundOff,
        grandTotal
    };
};

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
    const { voucherId, voucherNo, date, ledgerId, amount, type, narration, cashBankAccountId, financialYear } = data;

    const ledger = await AccountLedger.findById(ledgerId).session(session);
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, `Ledger ${ledgerId} not found`);

    // Create Ledger Entry
    await LedgerEntry.create([{
        voucherId, voucherNo, date, ledgerId, ledgerName: ledger.name,
        amount, type, narration, cashBankAccountId, financialYear
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
const adjustBill = async (adj, nature, voucherNo, date, session) => {
    const { refId, amount, adjustmentType, refModel } = adj;
    if (!refId || adjustmentType !== 'Against Bill') return;

    if (nature === 'Receipt') {
        const invoice = await SalesInvoice.findById(refId).session(session);
        if (!invoice) return;
        if (invoice.paymentStatus === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, `Sales Invoice ${invoice.invoiceNumber} is cancelled. Cannot receive payment.`);

        invoice.paidAmount += amount;
        const total = (invoice.roundedTotal || invoice.grandTotal);
        if (invoice.paidAmount >= total) invoice.paymentStatus = 'Paid';
        else if (invoice.paidAmount > 0) invoice.paymentStatus = 'Partially Paid';

        // Add to history
        invoice.payments.push({
            paymentDate: date,
            amountPaid: amount,
            paymentMode: 'Voucher',
            reference: voucherNo,
            remarks: `Receipt Voucher ${voucherNo}`
        });

        await invoice.save({ session });
    } else if (nature === 'Payment') {
        let doc;
        let modelType = refModel || 'PurchaseInvoice';

        if (modelType === 'PurchaseInvoice') {
            doc = await PurchaseInvoice.findById(refId).session(session);
        } else if (modelType === 'Voucher') {
            doc = await Voucher.findById(refId).session(session);
        }

        if (!doc) return;
        if (doc.paymentStatus === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, `${modelType} ${doc.invoiceNumber || doc.voucherNo} is cancelled. Cannot record payment.`);

        doc.paidAmount = (doc.paidAmount || 0) + amount;
        const total = (doc.grandTotal || doc.totalAmount);
        if (doc.paidAmount >= total) doc.paymentStatus = 'Paid';
        else if (doc.paidAmount > 0) doc.paymentStatus = 'Partially Paid';

        // Add to history
        if (modelType === 'PurchaseInvoice') {
            if (!doc.payments) doc.payments = [];
            doc.payments.push({
                paymentDate: date,
                amountPaid: amount,
                paymentMode: 'Voucher',
                reference: voucherNo,
                remarks: `Payment Voucher ${voucherNo}`
            });
        }
        // For Voucher, we don't have a payments array yet, but the paidAmount update is enough for basic outstanding report.

        await doc.save({ session });
    }
};

export const createVoucher = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { voucherTypeId, date, cashBankAccountId, totalAmount, items, narration, nature } = req.body;

        const vType = await VoucherType.findById(voucherTypeId).session(session);
        if (!vType) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher type not found');

        const fy = req.body.financialYear || getFYFromDate(date || new Date());
        const voucherNo = await getNextVoucherNo(voucherTypeId);
        const actualNature = vType.nature || nature;

        const voucher = new Voucher({
            ...req.body,
            voucherNo,
            financialYear: fy,
            voucherType: vType._id,
            nature: actualNature,
            voucherTypeName: vType.name,
            createdBy: req.user.id
        });

        // Journal Vouchers: Double Entry Mode (No header cashBankAccountId)
        if (actualNature === 'Journal') {
            let debitTotal = 0;
            let creditTotal = 0;

            for (const item of items) {
                if (item.type === 'Debit') debitTotal += item.amount;
                else creditTotal += item.amount;

                await postToLedger({
                    voucherId: voucher._id, voucherNo, date,
                    ledgerId: item.ledgerId, amount: item.amount,
                    type: item.type,
                    narration: item.narration || narration,
                    financialYear: fy
                }, session);
            }

            if (Math.abs(debitTotal - creditTotal) > 0.01) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Journal entries must be balanced (Total Dr = Total Cr)');
            }
        } 
        // Receipt / Payment / Expense / Contra: Single Entry Mode
        else {
            let mainLedgerId;
            let mainEntryType = 'Debit';
            let isCreditExpense = actualNature === 'Expense' && req.body.expenseType === 'Credit';
            let isGstEnabled = actualNature === 'Expense' && req.body.isGstEnabled;

            let processingTotal = totalAmount;

            if (isGstEnabled) {
                const gstResult = calculateVoucherGstTotals(items, req.body.gstType);
                Object.assign(voucher, gstResult);
                processingTotal = gstResult.grandTotal;
                voucher.items = gstResult.updatedItems;
            }

            if (isCreditExpense) {
                if (!req.body.partyId) throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier ledger (partyId) is required for Credit Expense');
                mainLedgerId = req.body.partyId;
                mainEntryType = 'Credit';
                voucher.paymentStatus = 'Unpaid';
                voucher.paidAmount = 0;
            } else {
                if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'Cash/Bank account is required for this voucher type');
                
                const mainLedger = await AccountLedger.findOne({ referenceId: cashBankAccountId }).session(session);
                if (!mainLedger) throw new ApiError(httpStatus.BAD_REQUEST, 'Main account ledger not found for selected Cash/Bank account');
                
                mainLedgerId = mainLedger._id;
                voucher.paymentStatus = 'Paid';
                voucher.paidAmount = processingTotal;

                if (actualNature === 'Payment' || actualNature === 'Expense') mainEntryType = 'Credit';
                else if (actualNature === 'Contra') {
                    mainEntryType = req.body.headerType || 'Debit'; 
                }
            }

            // Post Main Account (Header) - Total Amount (Tax Inclusive)
            await postToLedger({
                voucherId: voucher._id, voucherNo, date,
                ledgerId: mainLedgerId, amount: processingTotal,
                type: mainEntryType,
                narration: narration || `Main entry for ${voucherNo}`,
                cashBankAccountId: isCreditExpense ? null : cashBankAccountId,
                financialYear: fy
            }, session);

            // Post Item Entries (Taxable Amounts)
            for (const item of voucher.items) {
                await postToLedger({
                    voucherId: voucher._id, voucherNo, date,
                    ledgerId: item.ledgerId, amount: isGstEnabled ? item.taxableAmount : item.amount,
                    type: item.type, // Debit for Expense
                    narration: item.narration || narration,
                    financialYear: fy
                }, session);

                // Handle Bill Adjustments
                if (item.adjustments && item.adjustments.length > 0) {
                    for (const adj of item.adjustments) {
                        await adjustBill(adj, actualNature, voucherNo, date, session);
                    }
                }
            }

            // Post Tax Entries and Round Off if GST is enabled
            if (isGstEnabled) {
                const cgstLedger = await AccountLedger.findOne({ name: 'CGST Input' }).session(session);
                const sgstLedger = await AccountLedger.findOne({ name: 'SGST Input' }).session(session);
                const igstLedger = await AccountLedger.findOne({ name: 'IGST Input' }).session(session);
                const roundOffLedger = await AccountLedger.findOne({ name: 'Round Off' }).session(session);

                if (voucher.totalCgst > 0 && cgstLedger) {
                    await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: cgstLedger._id, amount: voucher.totalCgst, type: 'Debit', narration: 'Input CGST', financialYear: fy }, session);
                }
                if (voucher.totalSgst > 0 && sgstLedger) {
                    await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: sgstLedger._id, amount: voucher.totalSgst, type: 'Debit', narration: 'Input SGST', financialYear: fy }, session);
                }
                if (voucher.totalIgst > 0 && igstLedger) {
                    await postToLedger({ voucherId: voucher._id, voucherNo, date, ledgerId: igstLedger._id, amount: voucher.totalIgst, type: 'Debit', narration: 'Input IGST', financialYear: fy }, session);
                }
                if (voucher.roundOff !== 0 && roundOffLedger) {
                    await postToLedger({ 
                        voucherId: voucher._id, voucherNo, date, 
                        ledgerId: roundOffLedger._id, 
                        amount: Math.abs(voucher.roundOff), 
                        type: voucher.roundOff > 0 ? 'Debit' : 'Credit', 
                        narration: 'Round Off', 
                        financialYear: fy 
                    }, session);
                }
            }
        }

        await voucher.save({ session });
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
    const { from, to, nature, natureType, partyId, page = 1, limit = 50, showSystemGenerated } = req.query;
    const filter = {};
    
    // Hide system-generated vouchers by default unless explicitly requested
    if (showSystemGenerated !== 'true') {
        filter.isSystemGenerated = { $ne: true };
    }

    if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to) filter.date.$lte = new Date(to);
    }
    if (nature) filter.nature = nature;
    if (partyId) filter.partyId = partyId;
    if (req.query.financialYear) filter.financialYear = req.query.financialYear;

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

        // Delete Ledger Entries so they do not show up in the Ledger Report
        await LedgerEntry.deleteMany({ voucherId: voucher._id }).session(session);

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
