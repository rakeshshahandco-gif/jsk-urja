/**
 * Phase 2B-B posting audit stored on existing `vouchers` collection
 * to avoid creating a new Mongo collection under Atlas 500-limit.
 */
import mongoose from 'mongoose';
import { Voucher } from '../models/voucher.model.js';

function asObjectId(value) {
    if (!value) return value;
    if (value instanceof mongoose.Types.ObjectId) return value;
    const s = String(value);
    if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s);
    return value;
}

export async function findPostedByIdempotencyKey(companyId, idempotencyKey) {
    return Voucher.findOne({
        companyId: asObjectId(companyId),
        isSystemGenerated: true,
        nature: 'Journal',
        'rcmLiabilityMeta.idempotencyKey': idempotencyKey,
        'rcmLiabilityMeta.postingStatus': 'POSTED',
    }).lean();
}

export async function findPostingsForSource({ companyId, sourceVoucherId }) {
    const src = sourceVoucherId;
    const srcOid = asObjectId(sourceVoucherId);
    return Voucher.find({
        companyId: asObjectId(companyId),
        isSystemGenerated: true,
        'rcmLiabilityMeta.kind': 'RCM_LIABILITY',
        $or: [
            { 'rcmLiabilityMeta.sourceVoucherId': src },
            { 'rcmLiabilityMeta.sourceVoucherId': String(src) },
            ...(srcOid && srcOid !== src ? [{ 'rcmLiabilityMeta.sourceVoucherId': srcOid }] : []),
        ],
    })
        .sort({ createdAt: -1 })
        .lean();
}

export async function findPostingById(companyId, postingVoucherId) {
    return Voucher.findOne({
        _id: asObjectId(postingVoucherId),
        companyId: asObjectId(companyId),
        isSystemGenerated: true,
        'rcmLiabilityMeta.kind': 'RCM_LIABILITY',
    });
}

export function buildPostingResponseFromVoucher(voucher) {
    if (!voucher) return null;
    const m = voucher.rcmLiabilityMeta || {};
    return {
        _id: voucher._id,
        companyId: voucher.companyId,
        financialYear: voucher.financialYear,
        idempotencyKey: m.idempotencyKey,
        sourceModule: m.sourceModule,
        sourceVoucherType: m.sourceVoucherType,
        sourceVoucherId: m.sourceVoucherId,
        sourceVoucherNumber: m.sourceVoucherNumber,
        sourceVoucherDate: m.sourceVoucherDate,
        sourceLineId: m.sourceLineId,
        supplierId: m.supplierId,
        supplierName: m.supplierName,
        expensePurchaseLedgerId: m.expensePurchaseLedgerId,
        expensePurchaseLedgerName: m.expensePurchaseLedgerName,
        rcmCategory: m.rcmCategory,
        ruleId: m.ruleId,
        ruleCode: m.ruleCode,
        ruleVersion: m.ruleVersion,
        taxableValue: m.taxableValue,
        gstRate: m.gstRate,
        cgst: m.cgst,
        sgst: m.sgst,
        igst: m.igst,
        cess: m.cess,
        totalLiability: m.totalLiability,
        placeOfSupply: m.placeOfSupply,
        gstType: m.gstType,
        supplierPayable: m.supplierPayable,
        rcmAddedToSupplierPayable: false,
        accountingVoucherId: voucher._id,
        accountingVoucherNumber: voucher.voucherNo,
        accountingVoucherDate: voucher.date,
        ledgerMap: m.ledgerMap,
        postingStatus: m.postingStatus,
        lifecycleStatus: m.lifecycleStatus,
        taxPaymentStatus: m.taxPaymentStatus,
        itcStatus: m.itcStatus,
        gstr3bMappingStatus: m.gstr3bMappingStatus,
        amountPaid: m.amountPaid ?? 0,
        outstandingTotal: m.outstandingTotal,
        outstandingCgst: m.outstandingCgst,
        outstandingSgst: m.outstandingSgst,
        outstandingIgst: m.outstandingIgst,
        outstandingCess: m.outstandingCess,
        payments: m.payments || [],
        lastPaymentVoucherId: m.lastPaymentVoucherId,
        lastPaymentVoucherNumber: m.lastPaymentVoucherNumber,
        lastChallanReference: m.lastChallanReference,
        lastPaymentDate: m.lastPaymentDate,
        itcReview: m.itcReview || null,
        itcReleases: m.itcReleases || [],
        itcReleasedTotal: m.itcReleasedTotal ?? 0,
        itcRemainingTotal: m.itcRemainingTotal,
        lastItcReleaseVoucherId: m.lastItcReleaseVoucherId,
        lastItcReleaseVoucherNumber: m.lastItcReleaseVoucherNumber,
        postedBy: m.postedBy,
        postedAt: m.postedAt,
        confirmation: m.confirmation,
        decisionSnapshot: m.decisionSnapshot,
        simulationSnapshot: m.simulationSnapshot,
        reversalVoucherId: m.reversalVoucherId,
        reversalVoucherNumber: m.reversalVoucherNumber,
        reversedBy: m.reversedBy,
        reversedAt: m.reversedAt,
        reversalRemarks: m.reversalRemarks,
        auditHistory: m.auditHistory || [],
    };
}

/** True when any non-reversed RCM tax payment is recorded against the liability. */
export function hasActiveRcmTaxPayment(meta = {}) {
    const payments = (meta.payments || []).filter((p) => p.status !== 'REVERSED');
    if (payments.length) return true;
    if (Number(meta.amountPaid || 0) > 0) return true;
    const st = String(meta.taxPaymentStatus || '');
    return st === 'PAID' || st === 'PARTLY_PAID';
}

export const SOURCE_CANCEL_AFTER_PAYMENT_MESSAGE =
    'RCM tax payment has already been recorded. GST reconciliation and authorised reversal are required.';

export const SOURCE_CANCEL_AFTER_ITC_MESSAGE =
    'RCM ITC has already been released. ITC reversal and GST reconciliation are required before cancellation.';

/**
 * Block silent source Expense/Purchase cancel when RCM tax payment or ITC release exists.
 */
export async function assertSourceCancelAllowedForRcm({ companyId, sourceVoucherId }) {
    if (!companyId || !sourceVoucherId) return;
    const rows = await findPostingsForSource({ companyId, sourceVoucherId });
    let hasItc = false;
    let hasPayment = false;
    for (const row of rows) {
        const meta = row.rcmLiabilityMeta || {};
        if (meta.postingStatus !== 'POSTED') continue;
        if ((meta.itcReleases || []).some((r) => r.status !== 'REVERSED')) hasItc = true;
        if (hasActiveRcmTaxPayment(meta)) hasPayment = true;
    }
    if (hasItc) {
        const { ApiError } = await import('../utils/ApiError.js');
        throw new ApiError(400, SOURCE_CANCEL_AFTER_ITC_MESSAGE);
    }
    if (hasPayment) {
        const { ApiError } = await import('../utils/ApiError.js');
        throw new ApiError(400, SOURCE_CANCEL_AFTER_PAYMENT_MESSAGE);
    }
}

export default {
    findPostedByIdempotencyKey,
    findPostingsForSource,
    findPostingById,
    buildPostingResponseFromVoucher,
    hasActiveRcmTaxPayment,
    SOURCE_CANCEL_AFTER_PAYMENT_MESSAGE,
    SOURCE_CANCEL_AFTER_ITC_MESSAGE,
    assertSourceCancelAllowedForRcm,
};
