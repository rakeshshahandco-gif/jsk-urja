/**
 * Phase 2B-C — authorised RCM tax payment recording (full/partial).
 * Does NOT release ITC or alter GSTR-3B totals.
 * Accounting: Dr RCM * Payable / Cr bank|payment ledger (system Journal on vouchers).
 */
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';
import { postBalancedBatch } from './accounting/accountingPostingEngine.service.js';
import {
    findPostingById,
    buildPostingResponseFromVoucher,
} from './rcmLiabilityPostingStore.service.js';
import { assertPostingAllowed } from './accounting/accountingValidation.service.js';
import {
    RCM_LIFECYCLE,
    PHASE_2B_C_BANNER as DESIGN_2B_C_BANNER,
    PROPOSED_RCM_LEDGERS,
} from '../config/rcmAccountingDesign.js';

export const PHASE_2B_C_BANNER = DESIGN_2B_C_BANNER;
export const RCM_PAYMENT_STATUS = Object.freeze({
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    PARTLY_PAID: 'PARTLY_PAID',
    PAID: 'PAID',
    PAYMENT_REVERSED: 'PAYMENT_REVERSED',
    PAYMENT_REVIEW_REQUIRED: 'PAYMENT_REVIEW_REQUIRED',
});

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.009;

function paidComponents(meta = {}) {
    const payments = (meta.payments || []).filter((p) => p.status !== 'REVERSED');
    const sum = (key) => r2(payments.reduce((a, p) => a + (Number(p[key]) || 0), 0));
    return {
        cgstPaid: sum('cgstPaid'),
        sgstPaid: sum('sgstPaid'),
        igstPaid: sum('igstPaid'),
        cessPaid: sum('cessPaid'),
        interestPaid: sum('interestPaid'),
        lateFeePaid: sum('lateFeePaid'),
        totalPaid: sum('totalPaid'),
    };
}

export function computeOutstanding(meta = {}) {
    const paid = paidComponents(meta);
    const cgst = r2((Number(meta.cgst) || 0) - paid.cgstPaid);
    const sgst = r2((Number(meta.sgst) || 0) - paid.sgstPaid);
    const igst = r2((Number(meta.igst) || 0) - paid.igstPaid);
    const cess = r2((Number(meta.cess) || 0) - paid.cessPaid);
    return {
        cgst: Math.max(0, cgst),
        sgst: Math.max(0, sgst),
        igst: Math.max(0, igst),
        cess: Math.max(0, cess),
        total: Math.max(0, r2(cgst + sgst + igst + cess)),
        ...paid,
    };
}

export function derivePaymentStatus(meta = {}) {
    if (meta.postingStatus === 'REVERSED') return RCM_PAYMENT_STATUS.PAYMENT_REVIEW_REQUIRED;
    const out = computeOutstanding(meta);
    const liability = r2(
        (Number(meta.cgst) || 0)
        + (Number(meta.sgst) || 0)
        + (Number(meta.igst) || 0)
        + (Number(meta.cess) || 0),
    );
    if (out.totalPaid <= EPS) return RCM_PAYMENT_STATUS.PAYMENT_PENDING;
    if (out.total <= EPS && liability > EPS) return RCM_PAYMENT_STATUS.PAID;
    return RCM_PAYMENT_STATUS.PARTLY_PAID;
}

export function buildPaymentIdempotencyKey({
    companyId,
    liabilityPostingId,
    challanReference,
    paymentDate,
    cgstPaid,
    sgstPaid,
    igstPaid,
    cessPaid,
}) {
    let d = '';
    if (paymentDate) {
        const x = new Date(paymentDate);
        d = Number.isNaN(x.getTime())
            ? String(paymentDate).slice(0, 10)
            : x.toISOString().slice(0, 10);
    }
    return [
        String(companyId || ''),
        'RCM_TAX_PAYMENT',
        String(liabilityPostingId || ''),
        String(challanReference || '').trim().toUpperCase(),
        d,
        r2(cgstPaid),
        r2(sgstPaid),
        r2(igstPaid),
        r2(cessPaid),
    ].join('|');
}

async function validatePaymentLedger(companyId, ledgerId) {
    if (!ledgerId) throw new ApiError(400, 'paymentLedgerId is required');
    const ledger = await AccountLedger.findById(ledgerId).lean();
    if (!ledger) throw new ApiError(404, 'Payment ledger not found');
    if (companyId && ledger.companyId && String(ledger.companyId) !== String(companyId)) {
        throw new ApiError(403, 'Payment ledger does not belong to the active company');
    }
    if (String(ledger.status || 'Active').toLowerCase() === 'inactive') {
        throw new ApiError(400, 'Payment ledger is inactive');
    }
    const banned = new Set(PROPOSED_RCM_LEDGERS.doNotUse);
    if (banned.has(ledger.name)) {
        throw new ApiError(400, `Cannot use ordinary GST ledger "${ledger.name}" as RCM payment ledger`);
    }
    const name = String(ledger.name || '');
    if (/cash.?in.?hand/i.test(name) && ledger.type !== 'Bank' && !ledger.isBank && !ledger.isGstCashLedger) {
        throw new ApiError(
            400,
            'Cash-in-Hand is not allowed for RCM tax payment unless the existing GST payment architecture flags it as a bank/GST cash ledger.',
        );
    }
    const isBankish =
        ledger.type === 'Bank'
        || ledger.isBank === true
        || ledger.isCashLedger === true
        || ledger.isGstCashLedger === true
        || /bank|gst.?cash|electronic cash|challan|tax.?payment/i.test(name);
    if (!isBankish && ledger.type !== 'Cash') {
        throw new ApiError(
            400,
            'Select a Bank / GST cash / tax-payment clearing ledger.',
        );
    }
    if (ledger.type === 'Cash' && !isBankish && !/gst|tax.?payment|challan|electronic/i.test(name)) {
        throw new ApiError(
            400,
            'Ordinary Cash ledger is not allowed. Use Bank or an approved GST cash / tax-payment clearing ledger.',
        );
    }
    return ledger;
}

export async function findPaymentByIdempotencyKey(companyId, idempotencyKey) {
    return Voucher.findOne({
        companyId,
        isSystemGenerated: true,
        nature: 'Journal',
        'rcmLiabilityMeta.kind': 'RCM_TAX_PAYMENT',
        'rcmLiabilityMeta.idempotencyKey': idempotencyKey,
        'rcmLiabilityMeta.paymentStatus': { $ne: 'REVERSED' },
    }).lean();
}

/**
 * Record full or partial RCM tax payment against a posted liability.
 */
export async function recordRcmTaxPayment(input = {}) {
    const companyId = input.companyId;
    const liabilityPostingId = input.liabilityPostingId;
    if (!companyId || !liabilityPostingId) {
        throw new ApiError(400, 'companyId and liabilityPostingId are required');
    }
    if (input.confirmPayment !== true || input.checkboxAccepted !== true) {
        throw new ApiError(400, 'confirmPayment=true and checkboxAccepted=true are required');
    }

    const liabilityDoc = await findPostingById(companyId, liabilityPostingId);
    if (!liabilityDoc) throw new ApiError(404, 'RCM liability posting not found');
    const meta = liabilityDoc.rcmLiabilityMeta || {};
    if (meta.postingStatus !== 'POSTED') {
        throw new ApiError(400, 'RCM liability is not active (reversed/cancelled) — payment blocked');
    }
    if (meta.kind && meta.kind !== 'RCM_LIABILITY') {
        throw new ApiError(400, 'Invalid liability posting kind');
    }

    const financialYear = input.financialYear || liabilityDoc.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    if (input.financialYear && liabilityDoc.financialYear
        && String(input.financialYear) !== String(liabilityDoc.financialYear)) {
        throw new ApiError(400, 'Payment financial year must match the RCM liability posting');
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    if (Number.isNaN(paymentDate.getTime())) throw new ApiError(400, 'Invalid payment date');
    const challanReference = String(input.challanReference || '').trim();
    if (!challanReference) throw new ApiError(400, 'challan/reference number is required');
    const taxPeriod = String(input.taxPeriod || '').trim();
    if (!taxPeriod) throw new ApiError(400, 'taxPeriod is required');

    const cgstPaid = r2(input.cgstPaid);
    const sgstPaid = r2(input.sgstPaid);
    const igstPaid = r2(input.igstPaid);
    const cessPaid = r2(input.cessPaid);
    const interestPaid = r2(input.interestPaid);
    const lateFeePaid = r2(input.lateFeePaid);
    const taxPaid = r2(cgstPaid + sgstPaid + igstPaid + cessPaid);
    const totalPaid = r2(taxPaid + interestPaid + lateFeePaid);
    if (taxPaid <= EPS && interestPaid <= EPS && lateFeePaid <= EPS) {
        throw new ApiError(400, 'Payment amount must be greater than zero');
    }

    const idempotencyKey = buildPaymentIdempotencyKey({
        companyId,
        liabilityPostingId,
        challanReference,
        paymentDate,
        cgstPaid,
        sgstPaid,
        igstPaid,
        cessPaid,
    });
    const existingPay = await findPaymentByIdempotencyKey(companyId, idempotencyKey);
    if (existingPay) {
        return {
            status: 'ALREADY_RECORDED',
            banner: PHASE_2B_C_BANNER,
            message: 'RCM tax payment already recorded for this challan/allocation.',
            payment: existingPay.rcmLiabilityMeta,
            paymentVoucherId: existingPay._id,
            paymentVoucherNumber: existingPay.voucherNo,
            liability: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
            alreadyRecorded: true,
        };
    }

    const outstanding = computeOutstanding(meta);
    if (cgstPaid > outstanding.cgst + EPS) {
        throw new ApiError(400, `CGST payment ₹${cgstPaid} exceeds outstanding ₹${outstanding.cgst}`);
    }
    if (sgstPaid > outstanding.sgst + EPS) {
        throw new ApiError(400, `SGST payment ₹${sgstPaid} exceeds outstanding ₹${outstanding.sgst}`);
    }
    if (igstPaid > outstanding.igst + EPS) {
        throw new ApiError(400, `IGST payment ₹${igstPaid} exceeds outstanding ₹${outstanding.igst}`);
    }
    if (cessPaid > outstanding.cess + EPS) {
        throw new ApiError(400, `Cess payment exceeds outstanding`);
    }
    // Component isolation: cannot pay IGST against CGST-only liability etc. (already covered by outstanding)
    if (cgstPaid > EPS && (Number(meta.cgst) || 0) <= EPS) {
        throw new ApiError(400, 'CGST payment not allowed — no CGST liability on this posting');
    }
    if (sgstPaid > EPS && (Number(meta.sgst) || 0) <= EPS) {
        throw new ApiError(400, 'SGST payment not allowed — no SGST liability on this posting');
    }
    if (igstPaid > EPS && (Number(meta.igst) || 0) <= EPS) {
        throw new ApiError(400, 'IGST payment not allowed — no IGST liability on this posting');
    }

    const paymentLedger = await validatePaymentLedger(companyId, input.paymentLedgerId);
    const LM = meta.ledgerMap || {};

    await assertPostingAllowed({
        voucherDate: paymentDate,
        financialYear,
        adminOverride: input.adminOverride === true,
        unlockReason: input.unlockReason || input.remarks || 'RCM tax payment',
    });

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const again = await Voucher.findOne({
            companyId,
            'rcmLiabilityMeta.kind': 'RCM_TAX_PAYMENT',
            'rcmLiabilityMeta.idempotencyKey': idempotencyKey,
            'rcmLiabilityMeta.paymentStatus': { $ne: 'REVERSED' },
        }).session(session);
        if (again) {
            await session.abortTransaction();
            return {
                status: 'ALREADY_RECORDED',
                banner: PHASE_2B_C_BANNER,
                message: 'RCM tax payment already recorded for this challan/allocation.',
                payment: again.rcmLiabilityMeta,
                paymentVoucherId: again._id,
                paymentVoucherNumber: again.voucherNo,
                liability: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
                alreadyRecorded: true,
            };
        }

        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');

        const voucherNo = await getNextVoucherNo(vType._id, paymentDate, session);
        const lines = [];
        if (cgstPaid > EPS) {
            if (!LM.cgstPayableId) throw new ApiError(400, 'RCM CGST Payable ledger mapping missing');
            lines.push({
                ledgerId: LM.cgstPayableId,
                amount: cgstPaid,
                type: 'Debit',
                narration: `RCM CGST paid — ${challanReference}`,
            });
        }
        if (sgstPaid > EPS) {
            if (!LM.sgstPayableId) throw new ApiError(400, 'RCM SGST Payable ledger mapping missing');
            lines.push({
                ledgerId: LM.sgstPayableId,
                amount: sgstPaid,
                type: 'Debit',
                narration: `RCM SGST paid — ${challanReference}`,
            });
        }
        if (igstPaid > EPS) {
            if (!LM.igstPayableId) throw new ApiError(400, 'RCM IGST Payable ledger mapping missing');
            lines.push({
                ledgerId: LM.igstPayableId,
                amount: igstPaid,
                type: 'Debit',
                narration: `RCM IGST paid — ${challanReference}`,
            });
        }
        if (cessPaid > EPS) {
            if (!LM.cessPayableId) throw new ApiError(400, 'RCM Cess Payable ledger mapping missing');
            lines.push({
                ledgerId: LM.cessPayableId,
                amount: cessPaid,
                type: 'Debit',
                narration: `RCM Cess paid — ${challanReference}`,
            });
        }
        // Interest / late fee: credit bank only for now via separate Dr if ledger provided later;
        // for Phase 2B-C require they are tracked in meta but only tax clears RCM payable.
        // If interest/late fee paid without tax lines, still Cr bank for totalPaid with a clearing note —
        // owner asked to keep them separate; without dedicated ledgers we only allow tax lines to hit RCM payables.
        if (interestPaid > EPS || lateFeePaid > EPS) {
            // Credit bank for tax+interest+late fee; Dr payables only for tax components.
            // Interest/late fee portion: Dr same payment ledger is invalid; require them in meta only
            // OR add narration that interest/late fee are recorded but need dedicated ledgers later.
            // Safer: include interest+lateFee in Cr bank total and Dr a "GST Interest/Late Fee Expense"
            // only if provided — otherwise reject interest without ledger.
            if (!input.interestLateFeeLedgerId && (interestPaid > EPS || lateFeePaid > EPS)) {
                throw new ApiError(
                    400,
                    'interestLateFeeLedgerId is required when recording interest or late fee (kept separate from RCM tax).',
                );
            }
            if (interestPaid > EPS || lateFeePaid > EPS) {
                lines.push({
                    ledgerId: input.interestLateFeeLedgerId,
                    amount: r2(interestPaid + lateFeePaid),
                    type: 'Debit',
                    narration: `RCM interest/late fee — ${challanReference}`,
                });
            }
        }

        const creditTotal = r2(lines.reduce((a, l) => a + l.amount, 0));
        lines.push({
            ledgerId: paymentLedger._id,
            amount: creditTotal,
            type: 'Credit',
            narration: `RCM tax payment ${challanReference}`,
        });

        for (const line of lines) {
            if (PROPOSED_RCM_LEDGERS.doNotUse.includes(line.ledgerName)) {
                throw new ApiError(500, 'Refusing to post to banned ordinary GST ledger');
            }
        }

        const [payVoucher] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date: paymentDate,
                    financialYear,
                    companyId,
                    totalAmount: creditTotal,
                    narration:
                        input.remarks
                        || `RCM tax payment for liability ${liabilityDoc.voucherNo} — ITC not released`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    rcmLiabilityMeta: {
                        kind: 'RCM_TAX_PAYMENT',
                        idempotencyKey,
                        paysPostingId: liabilityDoc._id,
                        liabilityVoucherNumber: liabilityDoc.voucherNo,
                        taxPeriod,
                        paymentDate,
                        challanReference,
                        paymentLedgerId: paymentLedger._id,
                        paymentLedgerName: paymentLedger.name,
                        cgstPaid,
                        sgstPaid,
                        igstPaid,
                        cessPaid,
                        interestPaid,
                        lateFeePaid,
                        totalPaid: creditTotal,
                        paymentStatus: 'RECORDED',
                        itcStatus: 'PENDING_ELIGIBILITY_REVIEW',
                        gstr3bMappingStatus: 'NOT_AUTOMATICALLY_UPDATED',
                        recordedBy: input.userId || null,
                        recordedAt: new Date(),
                        remarks: input.remarks || '',
                        attachmentRef: input.attachmentRef || '',
                    },
                    items: lines.map((l) => ({
                        ledgerId: l.ledgerId,
                        amount: l.amount,
                        type: l.type,
                        narration: l.narration,
                    })),
                    createdBy: input.userId || null,
                },
            ],
            { session },
        );

        await postBalancedBatch({
            lines,
            voucherId: payVoucher._id,
            voucherNo,
            date: paymentDate,
            financialYear,
            session,
            label: 'RCM Tax Payment',
        });

        const paymentRecord = {
            paymentVoucherId: payVoucher._id,
            paymentVoucherNumber: voucherNo,
            paymentDate,
            challanReference,
            taxPeriod,
            paymentLedgerId: paymentLedger._id,
            paymentLedgerName: paymentLedger.name,
            cgstPaid,
            sgstPaid,
            igstPaid,
            cessPaid,
            interestPaid,
            lateFeePaid,
            totalPaid: creditTotal,
            status: 'RECORDED',
            recordedBy: input.userId || null,
            recordedAt: new Date(),
            remarks: input.remarks || '',
            idempotencyKey,
        };

        const payments = [...(meta.payments || []), paymentRecord];
        const nextMeta = { ...meta, payments };
        const nextOutstanding = computeOutstanding(nextMeta);
        const payStatus = derivePaymentStatus(nextMeta);
        const auditHistory = [...(meta.auditHistory || [])];
        auditHistory.push({
            at: new Date(),
            action: 'TAX_PAYMENT_RECORDED',
            userId: input.userId || null,
            detail: `Payment ${voucherNo} ₹${creditTotal} challan ${challanReference}`,
        });

        liabilityDoc.rcmLiabilityMeta = {
            ...nextMeta,
            taxPaymentStatus: payStatus,
            lifecycleStatus:
                payStatus === RCM_PAYMENT_STATUS.PAID
                    ? RCM_LIFECYCLE.TAX_PAID
                    : RCM_LIFECYCLE.TAX_PAYMENT_PENDING,
            itcStatus:
                payStatus === RCM_PAYMENT_STATUS.PAID
                    ? 'PENDING_ELIGIBILITY_REVIEW'
                    : (meta.itcStatus || 'NOT_AVAILABLE_YET'),
            gstr3bMappingStatus: 'NOT_AUTOMATICALLY_UPDATED',
            amountPaid: nextOutstanding.totalPaid,
            outstandingTotal: nextOutstanding.total,
            outstandingCgst: nextOutstanding.cgst,
            outstandingSgst: nextOutstanding.sgst,
            outstandingIgst: nextOutstanding.igst,
            outstandingCess: nextOutstanding.cess,
            lastPaymentVoucherId: payVoucher._id,
            lastPaymentVoucherNumber: voucherNo,
            lastChallanReference: challanReference,
            lastPaymentDate: paymentDate,
            auditHistory,
        };
        await liabilityDoc.save({ session });

        await session.commitTransaction();

        return {
            status: payStatus,
            banner: PHASE_2B_C_BANNER,
            message:
                payStatus === RCM_PAYMENT_STATUS.PAID
                    ? 'RCM tax fully paid. ITC Eligibility Review Pending — ITC not released.'
                    : 'RCM tax partially paid. ITC remains unavailable until full payment and later eligibility phase.',
            payment: paymentRecord,
            paymentVoucherId: payVoucher._id,
            paymentVoucherNumber: voucherNo,
            liability: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
            outstanding: nextOutstanding,
            itcStatus: liabilityDoc.rcmLiabilityMeta.itcStatus,
            alreadyRecorded: false,
            supplierPayableUnchanged: true,
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        const dup = await findPaymentByIdempotencyKey(companyId, idempotencyKey);
        if (dup) {
            return {
                status: 'ALREADY_RECORDED',
                banner: PHASE_2B_C_BANNER,
                payment: dup.rcmLiabilityMeta,
                paymentVoucherId: dup._id,
                paymentVoucherNumber: dup.voucherNo,
                alreadyRecorded: true,
            };
        }
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Authorised reversal of an RCM tax payment (ITC not released).
 */
export async function reverseRcmTaxPayment(input = {}) {
    const companyId = input.companyId;
    const paymentVoucherId = input.paymentVoucherId;
    if (!companyId || !paymentVoucherId) {
        throw new ApiError(400, 'companyId and paymentVoucherId are required');
    }
    if (input.confirmReverse !== true) {
        throw new ApiError(400, 'confirmReverse=true is required');
    }
    const reason = String(input.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Reversal reason is required');

    const payDoc = await Voucher.findOne({
        _id: paymentVoucherId,
        companyId,
        isSystemGenerated: true,
        'rcmLiabilityMeta.kind': 'RCM_TAX_PAYMENT',
    });
    if (!payDoc) throw new ApiError(404, 'RCM tax payment voucher not found');
    const payMeta = payDoc.rcmLiabilityMeta || {};
    if (payMeta.paymentStatus === 'REVERSED') {
        throw new ApiError(400, 'Payment already reversed');
    }

    const liabilityDoc = await findPostingById(companyId, payMeta.paysPostingId);
    if (!liabilityDoc) throw new ApiError(404, 'Linked RCM liability not found');
    const liabMeta = liabilityDoc.rcmLiabilityMeta || {};
    if (liabMeta.itcStatus === 'ITC_AVAILABLE'
        || liabMeta.itcStatus === 'ITC_CLAIMED'
        || liabMeta.itcStatus === 'RELEASED'
        || liabMeta.itcStatus === 'PARTLY_RELEASED'
        || (liabMeta.itcReleases || []).some((r) => r.status !== 'REVERSED')) {
        throw new ApiError(
            400,
            'ITC has already been released/claimed. Reverse ITC / reconcile before reversing this payment.',
        );
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');

        const date = input.reversalDate ? new Date(input.reversalDate) : new Date();
        const voucherNo = await getNextVoucherNo(vType._id, date, session);

        // Reverse original payment lines from payDoc.items
        const lines = (payDoc.items || []).map((it) => ({
            ledgerId: it.ledgerId,
            amount: it.amount,
            type: it.type === 'Debit' ? 'Credit' : 'Debit',
            narration: `Reverse RCM payment ${payDoc.voucherNo}`,
        }));
        if (!lines.length) throw new ApiError(400, 'Original payment has no lines to reverse');

        const [rev] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date,
                    financialYear: payDoc.financialYear,
                    companyId,
                    totalAmount: payDoc.totalAmount,
                    narration: `Reversal of RCM payment ${payDoc.voucherNo}: ${reason}`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    rcmLiabilityMeta: {
                        kind: 'RCM_TAX_PAYMENT_REVERSAL',
                        reversesPaymentId: payDoc._id,
                        paysPostingId: payMeta.paysPostingId,
                        reason,
                    },
                    items: lines.map((l) => ({
                        ledgerId: l.ledgerId,
                        amount: l.amount,
                        type: l.type,
                        narration: l.narration,
                    })),
                    createdBy: input.userId || null,
                },
            ],
            { session },
        );

        await postBalancedBatch({
            lines,
            voucherId: rev._id,
            voucherNo,
            date,
            financialYear: payDoc.financialYear,
            session,
            label: 'RCM Tax Payment Reversal',
        });

        payDoc.rcmLiabilityMeta = {
            ...payMeta,
            paymentStatus: 'REVERSED',
            reversedBy: input.userId || null,
            reversedAt: new Date(),
            reversalVoucherId: rev._id,
            reversalVoucherNumber: voucherNo,
            reversalReason: reason,
        };
        await payDoc.save({ session });

        const payments = (liabMeta.payments || []).map((p) => {
            if (String(p.paymentVoucherId) === String(payDoc._id)) {
                return { ...p, status: 'REVERSED', reversalVoucherId: rev._id };
            }
            return p;
        });
        const nextMeta = { ...liabMeta, payments };
        const outstanding = computeOutstanding(nextMeta);
        const payStatus = derivePaymentStatus(nextMeta);
        const auditHistory = [...(liabMeta.auditHistory || [])];
        auditHistory.push({
            at: new Date(),
            action: 'TAX_PAYMENT_REVERSED',
            userId: input.userId || null,
            detail: `Reversed payment ${payDoc.voucherNo} via ${voucherNo}: ${reason}`,
        });
        liabilityDoc.rcmLiabilityMeta = {
            ...nextMeta,
            taxPaymentStatus: payStatus,
            lifecycleStatus: RCM_LIFECYCLE.TAX_PAYMENT_PENDING,
            itcStatus: 'NOT_AVAILABLE_YET',
            amountPaid: outstanding.totalPaid,
            outstandingTotal: outstanding.total,
            outstandingCgst: outstanding.cgst,
            outstandingSgst: outstanding.sgst,
            outstandingIgst: outstanding.igst,
            outstandingCess: outstanding.cess,
            auditHistory,
        };
        await liabilityDoc.save({ session });

        await session.commitTransaction();
        return {
            status: RCM_PAYMENT_STATUS.PAYMENT_REVERSED,
            message: 'RCM tax payment reversed. Original payment retained for audit. ITC was not released.',
            reversalVoucherNumber: voucherNo,
            liability: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
            outstanding,
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        throw err;
    } finally {
        session.endSession();
    }
}

export function enrichLiabilityPaymentView(liability) {
    if (!liability) return null;
    const meta = liability.rcmLiabilityMeta || liability;
    const outstanding = computeOutstanding(meta);
    return {
        ...buildPostingResponseFromVoucher(
            liability.rcmLiabilityMeta
                ? liability
                : { ...liability, rcmLiabilityMeta: meta, voucherNo: liability.accountingVoucherNumber, date: liability.accountingVoucherDate, _id: liability._id || liability.accountingVoucherId },
        ),
        outstanding,
        paymentStatus: derivePaymentStatus(meta),
        payments: (meta.payments || []).filter((p) => p.status !== 'REVERSED'),
        itcStatus: meta.itcStatus || 'NOT_AVAILABLE_YET',
        gstr3bBanner: PHASE_2B_C_BANNER,
    };
}

export default {
    recordRcmTaxPayment,
    reverseRcmTaxPayment,
    computeOutstanding,
    derivePaymentStatus,
    buildPaymentIdempotencyKey,
    enrichLiabilityPaymentView,
    PHASE_2B_C_BANNER,
    RCM_PAYMENT_STATUS,
};
