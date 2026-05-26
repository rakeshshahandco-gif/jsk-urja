import { PaymentEntry } from '../models/paymentEntry.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';
import logger from '../utils/logger.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { createDeductionFromPaymentEntry } from '../services/tds.service.js';
import { previewPurchasePaymentTds, resolveVendorLedger } from '../services/tdsDecisionEngine.service.js';
import { normalizePan } from '../constants/tds.constants.js';
import { postTdsWithholdingForPayment } from '../services/tdsPaymentPosting.service.js';
import { applyPaymentToBalance, logTdsAudit, getTdsSettings } from '../services/tdsThreshold.service.js';

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
    // Optional TDS (when recording vendor payment — creates TdsDeduction for compliance)
    tdsSection: Joi.string().optional().allow('', null),
    tdsAmount: Joi.number().min(0).optional().default(0),
    tdsBaseAmount: Joi.number().min(0).optional().default(0),
    tdsDeducteePan: Joi.string().optional().allow('', null),
    tdsIsNonResident: Joi.boolean().optional().default(false),
    /** When true, keeps manual TDS fields (bypasses ledger master engine) */
    skipTdsEngine: Joi.boolean().optional().default(false),
    /** User confirmed TDS liability popup (YES) */
    tdsUserConfirmed: Joi.boolean().optional().default(false),
    /** User declined TDS on popup (NO) — payment saves without TDS */
    tdsPopupSkipped: Joi.boolean().optional().default(false),
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

    const invoice = await PurchaseInvoice.findById(value.invoiceId).populate(
        'supplierId',
        'supplierName panNumber deducteeConstitution',
    );
    if (!invoice) throw new ApiError(404, 'Invoice not found');
    if (invoice.status === 'Cancelled') throw new ApiError(400, 'Cannot record payment on a cancelled invoice');

    const supplierId = invoice.supplierId?._id || invoice.supplierId;
    const supplierPan = invoice.supplierId?.panNumber || '';

    // For cheque pending — payment status is Pending, not Completed
    let entryStatus = value.paymentStatus || 'Completed';
    if (value.paymentMode === 'Cheque' && value.chequeStatus === 'Pending') {
        entryStatus = 'Pending';
    } else if (value.paymentMode === 'Cheque' && value.chequeStatus === 'Bounced') {
        entryStatus = 'Failed';
    }

    const fy = value.financialYear || getFYFromDate(value.paymentDate || new Date());

    let tdsSection = (value.tdsSection || '').trim();
    let tdsAmount = Number(value.tdsAmount || 0);
    let tdsBaseAmount = Number(value.tdsBaseAmount || 0);
    let tdsDeducteePan = normalizePan(value.tdsDeducteePan || supplierPan || '');

    let tdsEngineApplied = false;
    let tdsApplicableComputed = false;
    let tdsCumulativeBefore = 0;
    let tdsThresholdUsed = 0;
    let tdsRateUsed = 0;
    let tdsWarningThresholdCross = false;
    let tdsGrossBase = 0;
    let vendorLedgerId = null;

    const vendorLed = await resolveVendorLedger(supplierId);
    vendorLedgerId = vendorLed?._id || null;

    const invoiceSnapshot = {
        grandTotal: invoice.grandTotal,
        totalTaxableAmount: invoice.totalTaxableAmount,
        totalTax: invoice.totalTax,
        totalCgst: invoice.totalCgst,
        totalSgst: invoice.totalSgst,
        totalIgst: invoice.totalIgst,
        freightTotalGst: invoice.freightTotalGst,
        roundOff: invoice.roundOff,
    };

    if (!value.skipTdsEngine && vendorLed?.tdsApplicable) {
        const preview = await previewPurchasePaymentTds({
            supplierId,
            financialYear: fy,
            amountPaid: value.amountPaid,
            tdsBaseAmount: value.tdsBaseAmount || 0,
            excludePaymentEntryId: undefined,
            invoiceSnapshot,
        });
        if (preview.engineActive && preview.decision) {
            const d = preview.decision;
            if (d.panBlock) {
                throw new ApiError(
                    400,
                    'PAN is mandatory for TDS on this vendor ledger — update Supplier Master with a valid PAN, or turn off TDS / use Skip TDS Engine for exceptional entry.',
                );
            }
            if (d.liabilityAlert && d.tdsApplicable && !value.tdsUserConfirmed && !value.tdsPopupSkipped) {
                throw new ApiError(
                    400,
                    'TDS liability alert — confirm deduction (tdsUserConfirmed) or explicitly skip (tdsPopupSkipped).',
                );
            }
            if (value.tdsPopupSkipped) {
                await logTdsAudit({
                    action: 'POPUP_SKIPPED',
                    supplierId,
                    section: d.tdsSection,
                    financialYear: fy,
                    userId: req.user._id,
                    details: { amountPaid: value.amountPaid, wouldBeTds: d.tdsAmount },
                });
                tdsEngineApplied = true;
                tdsApplicableComputed = false;
                tdsAmount = 0;
                tdsSection = '';
            } else {
            tdsEngineApplied = true;
            tdsApplicableComputed = d.tdsApplicable;
            tdsCumulativeBefore = d.cumulativeBefore;
            tdsThresholdUsed = d.tdsThreshold;
            tdsRateUsed = d.tdsRate;
            tdsWarningThresholdCross = d.thresholdWillCross;
            tdsGrossBase = d.tdsBase;
            tdsSection = d.tdsSection || tdsSection;
            tdsAmount = d.tdsAmount;
            tdsBaseAmount = d.tdsBase > 0 ? d.tdsBase : tdsBaseAmount;
            vendorLedgerId = preview.ledger?._id || vendorLedgerId;
            if (value.tdsUserConfirmed && d.tdsApplicable) {
                await logTdsAudit({
                    action: 'POPUP_CONFIRMED',
                    supplierId,
                    section: d.tdsSection,
                    financialYear: fy,
                    userId: req.user._id,
                    details: { tdsAmount: d.tdsAmount, cumulativeAfter: d.cumulativeAfter },
                });
            }
            }
        }
    }

    const entry = await PaymentEntry.create({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId,
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
        financialYear: fy,
        createdBy: req.user._id,
        tdsSection,
        tdsAmount,
        tdsBaseAmount,
        tdsDeducteePan,
        tdsIsNonResident: Boolean(value.tdsIsNonResident),
        tdsEngineApplied,
        tdsApplicableComputed,
        tdsCumulativeBefore,
        tdsThresholdUsed,
        tdsRateUsed,
        tdsWarningThresholdCross,
        tdsGrossBase,
        vendorLedgerId,
        tdsPostingStatus: 'none',
    });

    // Update invoice payment status (use updateOne to avoid re-validating stale enum values like 'Posted')
    const { paymentStatus, paidAmount } = await computeInvoicePaymentStatus(invoice._id, invoice);
    await PurchaseInvoice.findByIdAndUpdate(invoice._id, { paymentStatus, paidAmount }, { runValidators: false });

    if (entryStatus === 'Completed' && tdsSection) {
        try {
            await applyPaymentToBalance(entry.toObject(), req.user._id);
        } catch (balErr) {
            logger.warn(`[PaymentEntry] TDS balance update skipped: ${balErr.message}`);
        }
    }

    if (entryStatus === 'Completed' && tdsAmount > 0 && tdsSection) {
        try {
            await createDeductionFromPaymentEntry(entry._id, {}, req.user._id);
        } catch (tdsErr) {
            logger.warn(`[PaymentEntry] TDS auto-row skipped: ${tdsErr.message}`);
        }
        const tdsSettings = await getTdsSettings();
        if (tdsSettings.tdsPostingMode !== 'InlineAdjustment') {
            try {
                const postRes = await postTdsWithholdingForPayment(entry.toObject(), vendorLedgerId, req.user._id);
                await PaymentEntry.findByIdAndUpdate(entry._id, {
                    tdsPostingVoucherId: postRes.voucherId || null,
                    tdsPostingStatus: postRes.status === 'posted' ? 'posted' : 'skipped',
                    tdsPostingNote: postRes.note || '',
                });
                if (postRes.status === 'posted') {
                    await logTdsAudit({
                        action: 'AUTO_JV_CREATED',
                        supplierId,
                        section: tdsSection,
                        financialYear: fy,
                        paymentEntryId: entry._id,
                        voucherId: postRes.voucherId,
                        userId: req.user._id,
                    });
                }
            } catch (postErr) {
                logger.warn(`[PaymentEntry] TDS GL posting skipped: ${postErr.message}`);
            }
        } else {
            await logTdsAudit({
                action: 'INLINE_TDS_ADJUSTMENT',
                supplierId,
                section: tdsSection,
                financialYear: fy,
                paymentEntryId: entry._id,
                userId: req.user._id,
                details: { tdsAmount, netPaid: value.amountPaid },
            });
        }
    }

    const fresh = await PaymentEntry.findById(entry._id).lean();
    res.status(201).json(new ApiResponse(201, fresh, `Payment of ₹${value.amountPaid} recorded`));
});

export const getPaymentEntryById = asyncHandler(async (req, res) => {
    const entry = await PaymentEntry.findById(req.params.paymentEntryId)
        .populate('createdBy', 'name')
        .populate('supplierId', 'supplierName panNumber')
        .lean();
    if (!entry) throw new ApiError(404, 'Payment entry not found');
    res.json(new ApiResponse(200, entry, 'Payment entry'));
});

// ── GET /payment-entries/by-invoice/:invoiceId ────────────────────────────────
export const getPaymentsByInvoice = asyncHandler(async (req, res) => {
    logger.info(`[PaymentEntry] Fetching payments for invoice: ${req.params.invoiceId}`);
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
