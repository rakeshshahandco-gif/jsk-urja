import { PaymentEntry } from '../models/paymentEntry.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// ── Joi Schema ────────────────────────────────────────────────────────────────
const createPaymentSchema = Joi.object({
    invoiceId: Joi.string().required(),
    paymentDate: Joi.date().optional().default(new Date()),
    paymentMode: Joi.string().valid('Cash', 'UPI', 'Cheque', 'Net Banking', 'NEFT/RTGS/IMPS', 'Card', 'Other').required(),
    amountPaid: Joi.number().min(0.01).required(),
    // Cash
    cashAccount: Joi.string().optional().allow(''),
    // Bank
    bankName: Joi.string().optional().allow(''),
    fromAccount: Joi.string().optional().allow(''),
    transactionId: Joi.string().optional().allow(''),
    // UPI
    upiApp: Joi.string().optional().allow(''),
    upiTransactionId: Joi.string().optional().allow(''),
    // Cheque
    chequeNo: Joi.string().optional().allow(''),
    chequeDate: Joi.date().optional().allow(null),
    chequeStatus: Joi.string().valid('Cleared', 'Pending', 'Bounced').optional().default('Cleared'),
    // Other
    paymentStatus: Joi.string().valid('Completed', 'Pending', 'Failed').default('Completed'),
    notes: Joi.string().optional().allow(''),
});

// ── Determine invoice payment status ────────────────────────────────────────
const computeInvoicePaymentStatus = async (invoiceId, invoice) => {
    const allPayments = await PaymentEntry.find({ invoiceId, paymentStatus: { $ne: 'Failed' } });
    const totalPaid = r2(allPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0));
    const grandTotal = r2(invoice.grandTotal || 0);
    if (totalPaid <= 0) return { paymentStatus: 'Unpaid', paidAmount: 0 };
    if (totalPaid >= grandTotal) return { paymentStatus: 'Paid', paidAmount: totalPaid };
    return { paymentStatus: 'Partially Paid', paidAmount: totalPaid };
};

// ── POST /payment-entries ─────────────────────────────────────────────────────
export const createPaymentEntry = asyncHandler(async (req, res) => {
    const { error, value } = createPaymentSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const invoice = await PurchaseInvoice.findById(value.invoiceId)
        .populate('supplierId', 'supplierName');
    if (!invoice) throw new ApiError(404, 'Invoice not found');
    if (invoice.status === 'Cancelled') throw new ApiError(400, 'Cannot record payment on a cancelled invoice');

    // For cheque pending — payment status is Pending, not Completed
    let entryStatus = value.paymentStatus || 'Completed';
    if (value.paymentMode === 'Cheque' && value.chequeStatus === 'Pending') {
        entryStatus = 'Pending';
    }
    if (value.paymentMode === 'Cheque' && value.chequeStatus === 'Bounced') {
        entryStatus = 'Failed';
    }

    const entry = await PaymentEntry.create({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: invoice.supplierId?._id || invoice.supplierId,
        supplierName: invoice.supplierName || invoice.supplierId?.supplierName || '',
        invoiceTotal: invoice.grandTotal,
        paymentDate: value.paymentDate || new Date(),
        paymentMode: value.paymentMode,
        amountPaid: value.amountPaid,
        cashAccount: value.cashAccount || 'Main Cash',
        bankName: value.bankName || '',
        fromAccount: value.fromAccount || '',
        transactionId: value.transactionId || '',
        upiApp: value.upiApp || '',
        upiTransactionId: value.upiTransactionId || '',
        chequeNo: value.chequeNo || '',
        chequeDate: value.chequeDate || null,
        chequeStatus: value.chequeStatus || 'Cleared',
        paymentStatus: entryStatus,
        notes: value.notes || '',
        createdBy: req.user._id,
    });

    // Update invoice payment status (use updateOne to avoid re-validating stale enum values like 'Posted')
    const { paymentStatus, paidAmount } = await computeInvoicePaymentStatus(invoice._id, invoice);
    await PurchaseInvoice.findByIdAndUpdate(invoice._id, { paymentStatus, paidAmount }, { runValidators: false });

    res.status(201).json(new ApiResponse(201, entry, `Payment of ₹${value.amountPaid} recorded`));
});

// ── GET /payment-entries/by-invoice/:invoiceId ────────────────────────────────
export const getPaymentsByInvoice = asyncHandler(async (req, res) => {
    const entries = await PaymentEntry.find({ invoiceId: req.params.invoiceId })
        .sort({ paymentDate: -1 })
        .populate('createdBy', 'name');
    res.json(new ApiResponse(200, entries, 'Payment history'));
});

// ── GET /payment-entries/cash-book ────────────────────────────────────────────
export const getCashBook = asyncHandler(async (req, res) => {
    const { from, to, page = 1, limit = 50 } = req.query;
    const query = { paymentMode: 'Cash', paymentStatus: 'Completed' };
    if (from || to) {
        query.paymentDate = {};
        if (from) query.paymentDate.$gte = new Date(from);
        if (to) { const d = new Date(to); d.setHours(23, 59, 59); query.paymentDate.$lte = d; }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total] = await Promise.all([
        PaymentEntry.find(query).sort({ paymentDate: -1 }).skip(skip).limit(Number(limit)),
        PaymentEntry.countDocuments(query),
    ]);
    const totalAmount = r2(entries.reduce((s, e) => s + e.amountPaid, 0));
    res.json(new ApiResponse(200, { entries, total, totalAmount, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Cash Book'));
});

// ── GET /payment-entries/bank-book ────────────────────────────────────────────
export const getBankBook = asyncHandler(async (req, res) => {
    const { from, to, bankName, paymentMode, page = 1, limit = 50 } = req.query;
    const query = { paymentMode: { $in: ['UPI', 'Cheque', 'Net Banking', 'NEFT/RTGS/IMPS', 'Card', 'Other'] } };
    if (bankName) query.bankName = { $regex: bankName, $options: 'i' };
    if (paymentMode) query.paymentMode = paymentMode;
    if (from || to) {
        query.paymentDate = {};
        if (from) query.paymentDate.$gte = new Date(from);
        if (to) { const d = new Date(to); d.setHours(23, 59, 59); query.paymentDate.$lte = d; }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total] = await Promise.all([
        PaymentEntry.find(query).sort({ paymentDate: -1 }).skip(skip).limit(Number(limit)),
        PaymentEntry.countDocuments(query),
    ]);
    const totalAmount = r2(entries.reduce((s, e) => s + e.amountPaid, 0));
    res.json(new ApiResponse(200, { entries, total, totalAmount, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Bank Book'));
});
