/**
 * Phase 2C — RCM ITC eligibility review + controlled release.
 * Does NOT update GSTR-3B totals or mark ITC as claimed in return.
 * Does NOT post to ordinary Input CGST/SGST/IGST.
 */
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';
import { postBalancedBatch } from './accounting/accountingPostingEngine.service.js';
import { assertPostingAllowed } from './accounting/accountingValidation.service.js';
import {
    findPostingById,
    buildPostingResponseFromVoucher,
} from './rcmLiabilityPostingStore.service.js';
import { resolveRcmLedgerMap, ensureRcmLedgers } from './rcmLedgerEnsure.service.js';
import { computeOutstanding, derivePaymentStatus, RCM_PAYMENT_STATUS } from './rcmTaxPayment.service.js';
import {
    RCM_LIFECYCLE,
    PHASE_2C_BANNER,
    PHASE_2C_INELIGIBLE_BANNER,
    PROPOSED_RCM_LEDGERS,
    RCM_ITC_ELIGIBILITY,
    RCM_ITC_STATUS,
    RCM_INELIGIBLE_TREATMENT,
} from '../config/rcmAccountingDesign.js';

export {
    PHASE_2C_BANNER,
    PHASE_2C_INELIGIBLE_BANNER,
    RCM_ITC_ELIGIBILITY,
    RCM_ITC_STATUS,
    RCM_INELIGIBLE_TREATMENT,
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.009;

const DEFAULT_DOCS = Object.freeze([
    { code: 'SUPPLIER_BILL', label: 'Supplier invoice/bill', requiredByDefault: true },
    { code: 'SELF_INVOICE', label: 'Self-invoice', requiredByDefault: false },
    { code: 'PAYMENT_VOUCHER', label: 'Payment voucher / challan', requiredByDefault: true },
    { code: 'LIABILITY_POSTING', label: 'RCM liability posting', requiredByDefault: true },
    { code: 'GST_CHALLAN', label: 'GST payment challan', requiredByDefault: true },
    { code: 'PROOF_OF_PAYMENT', label: 'Proof of payment', requiredByDefault: false },
    { code: 'BUSINESS_USE', label: 'Business-use confirmation', requiredByDefault: true },
    { code: 'BLOCKED_CREDIT_REVIEW', label: 'Blocked-credit review', requiredByDefault: false },
    { code: 'ATTACHMENT', label: 'Supporting attachment uploaded', requiredByDefault: false },
    { code: 'REVIEWER_CONFIRM', label: 'Reviewer confirmation', requiredByDefault: true },
]);

function paidTaxFromMeta(meta = {}) {
    const out = computeOutstanding(meta);
    return {
        cgstPaid: out.cgstPaid,
        sgstPaid: out.sgstPaid,
        igstPaid: out.igstPaid,
        cessPaid: out.cessPaid,
        totalPaid: r2(out.cgstPaid + out.sgstPaid + out.igstPaid + out.cessPaid),
    };
}

function releasedComponents(meta = {}) {
    const releases = (meta.itcReleases || []).filter((r) => r.status !== 'REVERSED');
    const sum = (key) => r2(releases.reduce((a, r) => a + (Number(r[key]) || 0), 0));
    return {
        cgstReleased: sum('cgstReleased'),
        sgstReleased: sum('sgstReleased'),
        igstReleased: sum('igstReleased'),
        cessReleased: sum('cessReleased'),
        totalReleased: sum('totalReleased'),
    };
}

function reversedReleaseComponents(meta = {}) {
    const releases = (meta.itcReleases || []).filter((r) => r.status === 'REVERSED');
    // track amounts that were reversed via linked entries stored on release
    const sum = (key) => r2(releases.reduce((a, r) => a + (Number(r[key]) || 0), 0));
    return {
        cgstReversed: sum('cgstReleased'),
        sgstReversed: sum('sgstReleased'),
        igstReversed: sum('igstReleased'),
        cessReversed: sum('cessReleased'),
        totalReversed: sum('totalReleased'),
    };
}

export function computeItcBalances(meta = {}) {
    const paid = paidTaxFromMeta(meta);
    const released = releasedComponents(meta);
    const review = meta.itcReview || {};
    const eligible = {
        cgst: r2(review.eligibleCgst ?? (review.eligibilityDecision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE ? paid.cgstPaid : 0)),
        sgst: r2(review.eligibleSgst ?? (review.eligibilityDecision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE ? paid.sgstPaid : 0)),
        igst: r2(review.eligibleIgst ?? (review.eligibilityDecision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE ? paid.igstPaid : 0)),
        cess: r2(review.eligibleCess ?? (review.eligibilityDecision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE ? paid.cessPaid : 0)),
    };
    eligible.total = r2(eligible.cgst + eligible.sgst + eligible.igst + eligible.cess);
    const remaining = {
        cgst: Math.max(0, r2(eligible.cgst - released.cgstReleased)),
        sgst: Math.max(0, r2(eligible.sgst - released.sgstReleased)),
        igst: Math.max(0, r2(eligible.igst - released.igstReleased)),
        cess: Math.max(0, r2(eligible.cess - released.cessReleased)),
    };
    remaining.total = r2(remaining.cgst + remaining.sgst + remaining.igst + remaining.cess);
    const ineligible = {
        cgst: r2(review.ineligibleCgst ?? Math.max(0, paid.cgstPaid - eligible.cgst)),
        sgst: r2(review.ineligibleSgst ?? Math.max(0, paid.sgstPaid - eligible.sgst)),
        igst: r2(review.ineligibleIgst ?? Math.max(0, paid.igstPaid - eligible.igst)),
        cess: r2(review.ineligibleCess ?? Math.max(0, paid.cessPaid - eligible.cess)),
    };
    ineligible.total = r2(ineligible.cgst + ineligible.sgst + ineligible.igst + ineligible.cess);
    return { paid, eligible, released, remaining, ineligible, reversed: reversedReleaseComponents(meta) };
}

export function deriveItcStatus(meta = {}) {
    const decision = meta.itcReview?.eligibilityDecision;
    if (decision === RCM_ITC_ELIGIBILITY.INELIGIBLE) return RCM_ITC_STATUS.INELIGIBLE;
    if (decision === RCM_ITC_ELIGIBILITY.BLOCKED) return RCM_ITC_STATUS.BLOCKED;
    if (decision === RCM_ITC_ELIGIBILITY.TEMPORARILY_REVERSED) return RCM_ITC_STATUS.TEMPORARILY_REVERSED;

    const bal = computeItcBalances(meta);
    const activeReleases = (meta.itcReleases || []).filter((r) => r.status !== 'REVERSED');
    const allReversed = (meta.itcReleases || []).length > 0 && activeReleases.length === 0;
    if (allReversed) return RCM_ITC_STATUS.RELEASE_REVERSED;

    if (bal.released.totalReleased > EPS) {
        if (bal.remaining.total <= EPS && bal.eligible.total > EPS) return RCM_ITC_STATUS.RELEASED;
        return RCM_ITC_STATUS.PARTLY_RELEASED;
    }
    if (
        decision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE
        || decision === RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE
    ) {
        return RCM_ITC_STATUS.ELIGIBLE_NOT_RELEASED;
    }
    const payStatus = derivePaymentStatus(meta);
    if (payStatus === RCM_PAYMENT_STATUS.PAID) return RCM_ITC_STATUS.PENDING_ELIGIBILITY_REVIEW;
    return RCM_ITC_STATUS.NOT_AVAILABLE_YET;
}

export function buildItcReleaseIdempotencyKey({
    companyId,
    liabilityPostingId,
    releaseVersion,
    cgstReleased,
    sgstReleased,
    igstReleased,
    cessReleased,
}) {
    return [
        String(companyId || ''),
        'RCM_ITC_RELEASE',
        String(liabilityPostingId || ''),
        'PAID',
        `v${Number(releaseVersion) || 1}`,
        r2(cgstReleased),
        r2(sgstReleased),
        r2(igstReleased),
        r2(cessReleased),
    ].join('|');
}

async function assertSourceActive(meta = {}) {
    const sourceId = meta.sourceVoucherId;
    if (!sourceId) return;
    const { Voucher: V } = await import('../models/voucher.model.js');
    const { PurchaseInvoice } = await import('../models/purchaseInvoice.model.js');
    const v = await V.findById(sourceId).lean().catch(() => null);
    if (v && String(v.status || '').toLowerCase() === 'cancelled') {
        throw new ApiError(400, 'Source Expense voucher is cancelled — ITC release blocked');
    }
    const pi = await PurchaseInvoice.findById(sourceId).lean().catch(() => null);
    if (pi && String(pi.status || '').toLowerCase() === 'cancelled') {
        throw new ApiError(400, 'Source Purchase invoice is cancelled — ITC release blocked');
    }
}

function assertPaidFully(meta = {}) {
    if (meta.postingStatus !== 'POSTED') {
        throw new ApiError(400, 'RCM liability is not active — ITC release blocked');
    }
    const payStatus = derivePaymentStatus(meta);
    if (payStatus !== RCM_PAYMENT_STATUS.PAID) {
        throw new ApiError(400, 'RCM tax must be fully paid before ITC release (partly paid / pending blocked)');
    }
    const outstanding = computeOutstanding(meta);
    if (outstanding.total > EPS) {
        throw new ApiError(400, 'Component-wise RCM tax payment is incomplete — ITC release blocked');
    }
    const activePayments = (meta.payments || []).filter((p) => p.status !== 'REVERSED');
    if (!activePayments.length) {
        throw new ApiError(400, 'No active RCM tax payment — ITC release blocked');
    }
}

function docsForCategory(rcmCategory) {
    const cat = String(rcmCategory || '').toUpperCase();
    return DEFAULT_DOCS.map((d) => {
        let required = d.requiredByDefault;
        if (d.code === 'SELF_INVOICE' && ['RENT', 'LEGAL', 'GTA'].includes(cat)) required = true;
        if (d.code === 'BLOCKED_CREDIT_REVIEW' && cat === 'RENT') required = false;
        return { ...d, required, status: 'PENDING', attachmentRef: '' };
    });
}

/**
 * Build ITC eligibility review payload (read-only until saveReview).
 */
export async function getItcEligibilityReview({ companyId, liabilityPostingId }) {
    const doc = await findPostingById(companyId, liabilityPostingId);
    if (!doc) throw new ApiError(404, 'RCM liability posting not found');
    const meta = doc.rcmLiabilityMeta || {};
    const paid = paidTaxFromMeta(meta);
    const bal = computeItcBalances(meta);
    const lastPay = (meta.payments || []).filter((p) => p.status !== 'REVERSED').slice(-1)[0] || null;
    const review = meta.itcReview || {
        eligibilityDecision: RCM_ITC_ELIGIBILITY.PENDING_REVIEW,
        supportingDocuments: docsForCategory(meta.rcmCategory),
    };
    const igst = (Number(meta.igst) || 0) > EPS;
    const ledgerMap = await resolveRcmLedgerMap(companyId, { igst, includeInput: true });

    return {
        banner: PHASE_2C_BANNER,
        statusLabel: 'Tax Paid — ITC Review Pending',
        posting: buildPostingResponseFromVoucher(doc.toObject()),
        sourceVoucher: meta.sourceVoucherNumber,
        supplier: meta.supplierName,
        expensePurchaseLedger: meta.expensePurchaseLedgerName,
        rcmCategory: meta.rcmCategory,
        taxableValue: meta.taxableValue,
        taxPaid: paid,
        paymentDate: lastPay?.paymentDate || meta.lastPaymentDate,
        challanReference: lastPay?.challanReference || meta.lastChallanReference,
        itcReview: review,
        balances: bal,
        itcStatus: deriveItcStatus(meta),
        proposedInputLedgers: {
            cgst: PROPOSED_RCM_LEDGERS.input.cgst.name,
            sgst: PROPOSED_RCM_LEDGERS.input.sgst.name,
            igst: PROPOSED_RCM_LEDGERS.input.igst.name,
            cess: PROPOSED_RCM_LEDGERS.input.cess.name,
            recoverable: PROPOSED_RCM_LEDGERS.control.recoverable.name,
        },
        inputLedgersReady: ledgerMap.complete,
        inputLedgersMissing: ledgerMap.missing,
        gstr3bMappingStatus: 'NOT_AUTOMATICALLY_UPDATED',
        gstr3bPreview: {
            label: 'RCM ITC Released in Books — GSTR-3B Mapping Pending',
            futureTable: '4(A)(3) — Inward supplies liable to reverse charge (eligible ITC)',
            note: 'Preview only — not claimed in return in this phase.',
        },
        ineligibleTreatmentOptions: Object.values(RCM_INELIGIBLE_TREATMENT),
        releases: meta.itcReleases || [],
    };
}

/**
 * Save eligibility decision (does not release ITC).
 */
export async function saveItcEligibilityReview(input = {}) {
    const companyId = input.companyId;
    const liabilityPostingId = input.liabilityPostingId;
    if (!companyId || !liabilityPostingId) {
        throw new ApiError(400, 'companyId and liabilityPostingId are required');
    }
    const decision = String(input.eligibilityDecision || '').toUpperCase();
    if (!Object.values(RCM_ITC_ELIGIBILITY).includes(decision)) {
        throw new ApiError(400, `Invalid eligibilityDecision: ${decision}`);
    }
    if (decision === RCM_ITC_ELIGIBILITY.PENDING_REVIEW) {
        throw new ApiError(400, 'Select an explicit eligibility decision (not Pending Review)');
    }
    const reason = String(input.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Eligibility reason is required');

    const doc = await findPostingById(companyId, liabilityPostingId);
    if (!doc) throw new ApiError(404, 'RCM liability posting not found');
    const meta = doc.rcmLiabilityMeta || {};
    assertPaidFully(meta);
    await assertSourceActive(meta);

    const paid = paidTaxFromMeta(meta);
    let eligibleCgst = r2(input.eligibleCgst);
    let eligibleSgst = r2(input.eligibleSgst);
    let eligibleIgst = r2(input.eligibleIgst);
    let eligibleCess = r2(input.eligibleCess);
    let eligiblePercent = input.eligiblePercent != null ? Number(input.eligiblePercent) : null;

    if (decision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE) {
        eligibleCgst = paid.cgstPaid;
        eligibleSgst = paid.sgstPaid;
        eligibleIgst = paid.igstPaid;
        eligibleCess = paid.cessPaid;
        eligiblePercent = 100;
    } else if (decision === RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE) {
        if (eligiblePercent != null && eligiblePercent > 0 && eligiblePercent <= 100) {
            const ratio = eligiblePercent / 100;
            if (input.eligibleCgst == null) eligibleCgst = r2(paid.cgstPaid * ratio);
            if (input.eligibleSgst == null) eligibleSgst = r2(paid.sgstPaid * ratio);
            if (input.eligibleIgst == null) eligibleIgst = r2(paid.igstPaid * ratio);
            if (input.eligibleCess == null) eligibleCess = r2(paid.cessPaid * ratio);
        }
        if (r2(eligibleCgst + eligibleSgst + eligibleIgst + eligibleCess) <= EPS) {
            throw new ApiError(400, 'Partly Eligible requires eligible percentage or component amounts');
        }
    } else if (
        decision === RCM_ITC_ELIGIBILITY.INELIGIBLE
        || decision === RCM_ITC_ELIGIBILITY.BLOCKED
    ) {
        eligibleCgst = 0;
        eligibleSgst = 0;
        eligibleIgst = 0;
        eligibleCess = 0;
        eligiblePercent = 0;
    }

    if (eligibleCgst > paid.cgstPaid + EPS
        || eligibleSgst > paid.sgstPaid + EPS
        || eligibleIgst > paid.igstPaid + EPS
        || eligibleCess > paid.cessPaid + EPS) {
        throw new ApiError(400, 'Eligible amount cannot exceed tax paid by component');
    }

    const supportingDocuments = Array.isArray(input.supportingDocuments)
        ? input.supportingDocuments
        : (meta.itcReview?.supportingDocuments || docsForCategory(meta.rcmCategory));

    const requiredDocs = supportingDocuments.filter((d) => d.required);
    const incomplete = requiredDocs.filter(
        (d) => !['DONE', 'COMPLETE', 'YES', 'UPLOADED', 'CONFIRMED'].includes(String(d.status || '').toUpperCase()),
    );
    if (
        (decision === RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE
            || decision === RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE)
        && incomplete.length
        && input.overrideIncompleteDocs !== true
    ) {
        throw new ApiError(
            400,
            `Supporting documents incomplete: ${incomplete.map((d) => d.label || d.code).join(', ')}`,
        );
    }

    const itcReview = {
        eligibilityDecision: decision,
        eligiblePercent,
        eligibleCgst,
        eligibleSgst,
        eligibleIgst,
        eligibleCess,
        ineligibleCgst: r2(paid.cgstPaid - eligibleCgst),
        ineligibleSgst: r2(paid.sgstPaid - eligibleSgst),
        ineligibleIgst: r2(paid.igstPaid - eligibleIgst),
        ineligibleCess: r2(paid.cessPaid - eligibleCess),
        blockedAmount: decision === RCM_ITC_ELIGIBILITY.BLOCKED ? paid.totalPaid : 0,
        reason,
        remarks: input.remarks || '',
        reviewerId: input.userId || null,
        reviewedAt: new Date(),
        supportingDocuments,
        ledgerDefaultEligibility: input.ledgerDefaultEligibility || meta.itcReview?.ledgerDefaultEligibility || null,
        ineligibleTreatment: input.ineligibleTreatment || RCM_INELIGIBLE_TREATMENT.NONE,
        treatmentLedgerId: input.treatmentLedgerId || null,
    };

    const auditHistory = [...(meta.auditHistory || [])];
    auditHistory.push({
        at: new Date(),
        action: 'ITC_ELIGIBILITY_REVIEWED',
        userId: input.userId || null,
        detail: `${decision} — ${reason}`,
    });

    doc.rcmLiabilityMeta = {
        ...meta,
        itcReview,
        itcStatus: deriveItcStatus({ ...meta, itcReview }),
        lifecycleStatus:
            decision === RCM_ITC_ELIGIBILITY.INELIGIBLE || decision === RCM_ITC_ELIGIBILITY.BLOCKED
                ? RCM_LIFECYCLE.ITC_INELIGIBLE
                : RCM_LIFECYCLE.ITC_PENDING_ELIGIBILITY,
        auditHistory,
    };
    await doc.save();

    return {
        banner:
            decision === RCM_ITC_ELIGIBILITY.INELIGIBLE || decision === RCM_ITC_ELIGIBILITY.BLOCKED
                ? PHASE_2C_INELIGIBLE_BANNER
                : PHASE_2C_BANNER,
        message: 'ITC eligibility review saved. Release is a separate authorised action.',
        posting: buildPostingResponseFromVoucher(doc.toObject()),
        itcReview,
        itcStatus: doc.rcmLiabilityMeta.itcStatus,
        balances: computeItcBalances(doc.rcmLiabilityMeta),
    };
}

/**
 * Preview proposed release journal (no write).
 */
export async function previewItcRelease(input = {}) {
    const review = await getItcEligibilityReview(input);
    const meta = review.posting;
    const decision = meta.itcReview?.eligibilityDecision || review.itcReview?.eligibilityDecision;
    if (
        decision === RCM_ITC_ELIGIBILITY.INELIGIBLE
        || decision === RCM_ITC_ELIGIBILITY.BLOCKED
    ) {
        return {
            ...review,
            canRelease: false,
            reason: 'Ineligible/Blocked — no Input GST under RCM posting. Use authorised reclassification if approved.',
            proposedEntries: [],
            banner: PHASE_2C_INELIGIBLE_BANNER,
        };
    }
    if (
        decision !== RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE
        && decision !== RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE
    ) {
        return {
            ...review,
            canRelease: false,
            reason: 'Save an eligible review decision before release.',
            proposedEntries: [],
        };
    }

    const bal = review.balances;
    const cgst = r2(input.cgstReleased ?? bal.remaining.cgst);
    const sgst = r2(input.sgstReleased ?? bal.remaining.sgst);
    const igst = r2(input.igstReleased ?? bal.remaining.igst);
    const cess = r2(input.cessReleased ?? bal.remaining.cess);
    const total = r2(cgst + sgst + igst + cess);
    const entries = [];
    if (cgst > EPS) {
        entries.push({ drCr: 'Dr', ledger: PROPOSED_RCM_LEDGERS.input.cgst.name, amount: cgst });
    }
    if (sgst > EPS) {
        entries.push({ drCr: 'Dr', ledger: PROPOSED_RCM_LEDGERS.input.sgst.name, amount: sgst });
    }
    if (igst > EPS) {
        entries.push({ drCr: 'Dr', ledger: PROPOSED_RCM_LEDGERS.input.igst.name, amount: igst });
    }
    if (cess > EPS) {
        entries.push({ drCr: 'Dr', ledger: PROPOSED_RCM_LEDGERS.input.cess.name, amount: cess });
    }
    if (total > EPS) {
        entries.push({
            drCr: 'Cr',
            ledger: PROPOSED_RCM_LEDGERS.control.recoverable.name,
            amount: total,
        });
    }
    return {
        ...review,
        canRelease: total > EPS && review.inputLedgersReady,
        warning:
            'This will post eligible RCM Input Tax Credit into accounts. It will not automatically update GSTR-3B.',
        releaseAmounts: { cgst, sgst, igst, cess, total },
        proposedEntries: entries,
    };
}

async function findReleaseByIdempotency(companyId, key) {
    return Voucher.findOne({
        companyId,
        isSystemGenerated: true,
        nature: 'Journal',
        'rcmLiabilityMeta.kind': 'RCM_ITC_RELEASE',
        'rcmLiabilityMeta.idempotencyKey': key,
        'rcmLiabilityMeta.releaseStatus': { $ne: 'REVERSED' },
    }).lean();
}

/**
 * Authorised ITC release (eligible amounts only).
 */
export async function releaseRcmItc(input = {}) {
    const companyId = input.companyId;
    const liabilityPostingId = input.liabilityPostingId;
    if (!companyId || !liabilityPostingId) {
        throw new ApiError(400, 'companyId and liabilityPostingId are required');
    }
    if (input.confirmRelease !== true || input.checkboxAccepted !== true) {
        throw new ApiError(400, 'confirmRelease=true and checkboxAccepted=true are required');
    }

    const liabilityDoc = await findPostingById(companyId, liabilityPostingId);
    if (!liabilityDoc) throw new ApiError(404, 'RCM liability posting not found');
    const meta = liabilityDoc.rcmLiabilityMeta || {};
    assertPaidFully(meta);
    await assertSourceActive(meta);

    const decision = meta.itcReview?.eligibilityDecision;
    if (decision === RCM_ITC_ELIGIBILITY.BLOCKED) {
        throw new ApiError(400, 'ITC is BLOCKED — release not allowed');
    }
    if (decision === RCM_ITC_ELIGIBILITY.INELIGIBLE) {
        throw new ApiError(
            400,
            'ITC is INELIGIBLE — no Input GST under RCM. Use authorised reclassification treatment separately.',
        );
    }
    if (
        decision !== RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE
        && decision !== RCM_ITC_ELIGIBILITY.PARTLY_ELIGIBLE
    ) {
        throw new ApiError(400, 'Save FULLY_ELIGIBLE or PARTLY_ELIGIBLE review before release');
    }

    const reason = String(input.reason || meta.itcReview?.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Release reason is required');

    const bal = computeItcBalances(meta);
    const cgstReleased = r2(input.cgstReleased ?? bal.remaining.cgst);
    const sgstReleased = r2(input.sgstReleased ?? bal.remaining.sgst);
    const igstReleased = r2(input.igstReleased ?? bal.remaining.igst);
    const cessReleased = r2(input.cessReleased ?? bal.remaining.cess);
    const totalReleased = r2(cgstReleased + sgstReleased + igstReleased + cessReleased);
    if (totalReleased <= EPS) throw new ApiError(400, 'Release amount must be greater than zero');

    const releaseVersion = input.releaseVersion || ((meta.itcReleases || []).length + 1);
    const idempotencyKey = buildItcReleaseIdempotencyKey({
        companyId,
        liabilityPostingId,
        releaseVersion,
        cgstReleased,
        sgstReleased,
        igstReleased,
        cessReleased,
    });
    const existing = await findReleaseByIdempotency(companyId, idempotencyKey);
    if (existing) {
        return {
            status: 'ALREADY_RELEASED',
            banner: PHASE_2C_BANNER,
            message: 'RCM ITC release already recorded for this allocation.',
            release: existing.rcmLiabilityMeta,
            releaseVoucherId: existing._id,
            releaseVoucherNumber: existing.voucherNo,
            posting: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
            alreadyReleased: true,
        };
    }

    if (cgstReleased > bal.remaining.cgst + EPS
        || sgstReleased > bal.remaining.sgst + EPS
        || igstReleased > bal.remaining.igst + EPS
        || cessReleased > bal.remaining.cess + EPS) {
        throw new ApiError(400, 'Release exceeds remaining unreleased eligible ITC');
    }
    if (cgstReleased > bal.eligible.cgst + EPS
        || sgstReleased > bal.eligible.sgst + EPS
        || igstReleased > bal.eligible.igst + EPS
        || cessReleased > bal.eligible.cess + EPS) {
        throw new ApiError(400, 'Release exceeds eligible ITC / tax paid');
    }

    const financialYear = input.financialYear || liabilityDoc.financialYear;
    const releaseDate = input.releaseDate ? new Date(input.releaseDate) : new Date();
    await assertPostingAllowed({
        voucherDate: releaseDate,
        financialYear,
        adminOverride: input.adminOverride === true,
        unlockReason: input.unlockReason || reason,
    });

    const igstMode = igstReleased > EPS;
    let ledgerRes = await resolveRcmLedgerMap(companyId, { igst: igstMode, includeInput: true, cess: cessReleased > EPS });
    if (!ledgerRes.complete) {
        if (input.confirmCreate === true) {
            await ensureRcmLedgers({
                companyId,
                userId: input.userId,
                confirmCreate: true,
                includeInputLedgers: true,
                includeOptionalCess: cessReleased > EPS,
            });
            ledgerRes = await resolveRcmLedgerMap(companyId, {
                igst: igstMode,
                includeInput: true,
                cess: cessReleased > EPS,
            });
        }
        if (!ledgerRes.complete) {
            throw new ApiError(
                400,
                `RCM Input ledgers missing: ${ledgerRes.missing.join(', ')}. Call ensure-ledgers with confirmCreate=true and includeInputLedgers=true.`,
            );
        }
    }
    const LM = ledgerRes.map;
    const recoverableId = meta.ledgerMap?.recoverableId || LM.recoverable?._id;
    if (!recoverableId) throw new ApiError(400, 'RCM GST Recoverable ledger mapping missing');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const again = await Voucher.findOne({
            companyId,
            'rcmLiabilityMeta.kind': 'RCM_ITC_RELEASE',
            'rcmLiabilityMeta.idempotencyKey': idempotencyKey,
            'rcmLiabilityMeta.releaseStatus': { $ne: 'REVERSED' },
        }).session(session);
        if (again) {
            await session.abortTransaction();
            return {
                status: 'ALREADY_RELEASED',
                banner: PHASE_2C_BANNER,
                release: again.rcmLiabilityMeta,
                releaseVoucherId: again._id,
                releaseVoucherNumber: again.voucherNo,
                alreadyReleased: true,
            };
        }

        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');

        const voucherNo = await getNextVoucherNo(vType._id, releaseDate, session);
        const lines = [];
        if (cgstReleased > EPS) {
            if (!LM.inputCgst?._id) throw new ApiError(400, 'Input CGST under RCM ledger missing');
            lines.push({
                ledgerId: LM.inputCgst._id,
                amount: cgstReleased,
                type: 'Debit',
                narration: 'RCM ITC — Input CGST under RCM',
            });
        }
        if (sgstReleased > EPS) {
            if (!LM.inputSgst?._id) throw new ApiError(400, 'Input SGST under RCM ledger missing');
            lines.push({
                ledgerId: LM.inputSgst._id,
                amount: sgstReleased,
                type: 'Debit',
                narration: 'RCM ITC — Input SGST under RCM',
            });
        }
        if (igstReleased > EPS) {
            if (!LM.inputIgst?._id) throw new ApiError(400, 'Input IGST under RCM ledger missing');
            lines.push({
                ledgerId: LM.inputIgst._id,
                amount: igstReleased,
                type: 'Debit',
                narration: 'RCM ITC — Input IGST under RCM',
            });
        }
        if (cessReleased > EPS) {
            if (!LM.inputCess?._id) throw new ApiError(400, 'Input Cess under RCM ledger missing');
            lines.push({
                ledgerId: LM.inputCess._id,
                amount: cessReleased,
                type: 'Debit',
                narration: 'RCM ITC — Input Cess under RCM',
            });
        }
        lines.push({
            ledgerId: recoverableId,
            amount: totalReleased,
            type: 'Credit',
            narration: 'Clear RCM GST Recoverable on ITC release',
        });

        for (const banned of PROPOSED_RCM_LEDGERS.doNotUse) {
            // safety: lines use ids only; names checked via resolve map
            if (LM.inputCgst?.name === banned) throw new ApiError(500, 'Banned ordinary GST ledger');
        }

        const [relVoucher] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date: releaseDate,
                    financialYear,
                    companyId,
                    totalAmount: totalReleased,
                    narration:
                        input.remarks
                        || `RCM ITC release for ${liabilityDoc.voucherNo} — GSTR-3B not auto-updated`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    rcmLiabilityMeta: {
                        kind: 'RCM_ITC_RELEASE',
                        idempotencyKey,
                        releasesPostingId: liabilityDoc._id,
                        liabilityVoucherNumber: liabilityDoc.voucherNo,
                        cgstReleased,
                        sgstReleased,
                        igstReleased,
                        cessReleased,
                        totalReleased,
                        releaseStatus: 'RELEASED',
                        reason,
                        releasedBy: input.userId || null,
                        releasedAt: new Date(),
                        gstr3bMappingStatus: 'NOT_AUTOMATICALLY_UPDATED',
                        gstr3bClaimed: false,
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
            voucherId: relVoucher._id,
            voucherNo,
            date: releaseDate,
            financialYear,
            session,
            label: 'RCM ITC Release',
        });

        const releaseRecord = {
            releaseVoucherId: relVoucher._id,
            releaseVoucherNumber: voucherNo,
            releaseDate,
            cgstReleased,
            sgstReleased,
            igstReleased,
            cessReleased,
            totalReleased,
            status: 'RELEASED',
            reason,
            releasedBy: input.userId || null,
            releasedAt: new Date(),
            idempotencyKey,
        };
        const itcReleases = [...(meta.itcReleases || []), releaseRecord];
        const nextMeta = { ...meta, itcReleases };
        const nextBal = computeItcBalances(nextMeta);
        const itcStatus = deriveItcStatus(nextMeta);
        const auditHistory = [...(meta.auditHistory || [])];
        auditHistory.push({
            at: new Date(),
            action: 'ITC_RELEASED',
            userId: input.userId || null,
            detail: `Release ${voucherNo} ₹${totalReleased}`,
        });

        liabilityDoc.rcmLiabilityMeta = {
            ...nextMeta,
            itcStatus,
            lifecycleStatus: RCM_LIFECYCLE.ITC_AVAILABLE,
            gstr3bMappingStatus: 'NOT_AUTOMATICALLY_UPDATED',
            itcReleasedTotal: nextBal.released.totalReleased,
            itcRemainingTotal: nextBal.remaining.total,
            lastItcReleaseVoucherId: relVoucher._id,
            lastItcReleaseVoucherNumber: voucherNo,
            auditHistory,
        };
        await liabilityDoc.save({ session });
        await session.commitTransaction();

        return {
            status: itcStatus,
            banner: PHASE_2C_BANNER,
            message:
                'RCM ITC released into Input GST under RCM ledgers. GSTR-3B automatic update is not enabled. ITC is not claimed in return.',
            release: releaseRecord,
            releaseVoucherId: relVoucher._id,
            releaseVoucherNumber: voucherNo,
            posting: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
            balances: nextBal,
            alreadyReleased: false,
            supplierPayableUnchanged: true,
            bankUnchanged: true,
            ordinaryInputGstUnchanged: true,
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        const dup = await findReleaseByIdempotency(companyId, idempotencyKey);
        if (dup) {
            return {
                status: 'ALREADY_RELEASED',
                banner: PHASE_2C_BANNER,
                release: dup.rcmLiabilityMeta,
                releaseVoucherId: dup._id,
                releaseVoucherNumber: dup.voucherNo,
                alreadyReleased: true,
            };
        }
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Optional authorised reclassification of ineligible/blocked Recoverable
 * (does NOT create Input under RCM). Requires explicit treatment + ledger + confirm.
 */
export async function reclassifyIneligibleRcmTax(input = {}) {
    const companyId = input.companyId;
    const liabilityPostingId = input.liabilityPostingId;
    if (!companyId || !liabilityPostingId) {
        throw new ApiError(400, 'companyId and liabilityPostingId are required');
    }
    if (input.confirmTreatment !== true || input.checkboxAccepted !== true) {
        throw new ApiError(400, 'confirmTreatment=true and checkboxAccepted=true are required');
    }
    const treatment = String(input.ineligibleTreatment || '').toUpperCase();
    if (!treatment || treatment === RCM_INELIGIBLE_TREATMENT.NONE) {
        throw new ApiError(400, 'Select an explicit ineligible accounting treatment');
    }
    if (!Object.values(RCM_INELIGIBLE_TREATMENT).includes(treatment)) {
        throw new ApiError(400, `Invalid treatment: ${treatment}`);
    }
    if (!input.treatmentLedgerId) {
        throw new ApiError(400, 'treatmentLedgerId is required for reclassification');
    }
    const reason = String(input.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Reclassification reason is required');

    const liabilityDoc = await findPostingById(companyId, liabilityPostingId);
    if (!liabilityDoc) throw new ApiError(404, 'RCM liability posting not found');
    const meta = liabilityDoc.rcmLiabilityMeta || {};
    const decision = meta.itcReview?.eligibilityDecision;
    if (
        decision !== RCM_ITC_ELIGIBILITY.INELIGIBLE
        && decision !== RCM_ITC_ELIGIBILITY.BLOCKED
    ) {
        throw new ApiError(400, 'Reclassification only for INELIGIBLE or BLOCKED reviews');
    }

    const costLedger = await AccountLedger.findById(input.treatmentLedgerId).lean();
    if (!costLedger) throw new ApiError(404, 'Treatment ledger not found');
    if (companyId && costLedger.companyId && String(costLedger.companyId) !== String(companyId)) {
        throw new ApiError(403, 'Treatment ledger does not belong to active company');
    }
    if (PROPOSED_RCM_LEDGERS.doNotUse.includes(costLedger.name)) {
        throw new ApiError(400, 'Cannot reclassify into ordinary Input/Output GST ledger');
    }

    const paid = paidTaxFromMeta(meta);
    const amount = r2(input.amount ?? paid.totalPaid);
    if (amount <= EPS) throw new ApiError(400, 'Reclassification amount must be > 0');
    if (amount > paid.totalPaid + EPS) {
        throw new ApiError(400, 'Cannot reclassify more than tax paid');
    }

    const recoverableId = meta.ledgerMap?.recoverableId;
    if (!recoverableId) throw new ApiError(400, 'RCM GST Recoverable mapping missing');

    const financialYear = input.financialYear || liabilityDoc.financialYear;
    const date = input.reclassDate ? new Date(input.reclassDate) : new Date();
    await assertPostingAllowed({
        voucherDate: date,
        financialYear,
        adminOverride: input.adminOverride === true,
        unlockReason: reason,
    });

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');
        const voucherNo = await getNextVoucherNo(vType._id, date, session);
        const lines = [
            {
                ledgerId: costLedger._id,
                amount,
                type: 'Debit',
                narration: `RCM ineligible GST — ${treatment}`,
            },
            {
                ledgerId: recoverableId,
                amount,
                type: 'Credit',
                narration: 'Clear RCM Recoverable (ineligible reclassification)',
            },
        ];
        const [jv] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date,
                    financialYear,
                    companyId,
                    totalAmount: amount,
                    narration: `RCM ineligible reclassification: ${reason}`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    rcmLiabilityMeta: {
                        kind: 'RCM_INELIGIBLE_RECLASS',
                        releasesPostingId: liabilityDoc._id,
                        treatment,
                        treatmentLedgerId: costLedger._id,
                        treatmentLedgerName: costLedger.name,
                        amount,
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
            voucherId: jv._id,
            voucherNo,
            date,
            financialYear,
            session,
            label: 'RCM Ineligible Reclass',
        });

        const auditHistory = [...(meta.auditHistory || [])];
        auditHistory.push({
            at: new Date(),
            action: 'ITC_INELIGIBLE_RECLASSIFIED',
            userId: input.userId || null,
            detail: `${treatment} ₹${amount} via ${voucherNo}`,
        });
        liabilityDoc.rcmLiabilityMeta = {
            ...meta,
            itcReview: {
                ...(meta.itcReview || {}),
                ineligibleTreatment: treatment,
                treatmentLedgerId: costLedger._id,
                treatmentLedgerName: costLedger.name,
                reclassVoucherId: jv._id,
                reclassVoucherNumber: voucherNo,
            },
            auditHistory,
        };
        await liabilityDoc.save({ session });
        await session.commitTransaction();
        return {
            banner: PHASE_2C_INELIGIBLE_BANNER,
            message: 'Ineligible/Blocked RCM tax reclassified. No Input GST under RCM was posted.',
            reclassVoucherNumber: voucherNo,
            posting: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Reverse an ITC release (authorised).
 */
export async function reverseRcmItcRelease(input = {}) {
    const companyId = input.companyId;
    const releaseVoucherId = input.releaseVoucherId;
    if (!companyId || !releaseVoucherId) {
        throw new ApiError(400, 'companyId and releaseVoucherId are required');
    }
    if (input.confirmReverse !== true) {
        throw new ApiError(400, 'confirmReverse=true is required');
    }
    const reason = String(input.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Reversal reason is required');

    const relDoc = await Voucher.findOne({
        _id: releaseVoucherId,
        companyId,
        isSystemGenerated: true,
        'rcmLiabilityMeta.kind': 'RCM_ITC_RELEASE',
    });
    if (!relDoc) throw new ApiError(404, 'RCM ITC release voucher not found');
    const relMeta = relDoc.rcmLiabilityMeta || {};
    if (relMeta.releaseStatus === 'REVERSED') {
        throw new ApiError(400, 'ITC release already reversed');
    }

    const liabilityDoc = await findPostingById(companyId, relMeta.releasesPostingId);
    if (!liabilityDoc) throw new ApiError(404, 'Linked RCM liability not found');
    const liabMeta = liabilityDoc.rcmLiabilityMeta || {};

    const cgstRev = r2(input.cgstReversed ?? relMeta.cgstReleased);
    const sgstRev = r2(input.sgstReversed ?? relMeta.sgstReleased);
    const igstRev = r2(input.igstReversed ?? relMeta.igstReleased);
    const cessRev = r2(input.cessReversed ?? relMeta.cessReleased);
    if (cgstRev > (Number(relMeta.cgstReleased) || 0) + EPS
        || sgstRev > (Number(relMeta.sgstReleased) || 0) + EPS
        || igstRev > (Number(relMeta.igstReleased) || 0) + EPS
        || cessRev > (Number(relMeta.cessReleased) || 0) + EPS) {
        throw new ApiError(400, 'Reversal exceeds released amount');
    }
    const totalRev = r2(cgstRev + sgstRev + igstRev + cessRev);
    if (totalRev <= EPS) throw new ApiError(400, 'Reversal amount must be > 0');

    const temporary = input.temporary === true;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const vType =
            (await VoucherType.findOne({ nature: 'Journal', isActive: { $ne: false } }).session(session))
            || (await VoucherType.findOne({ name: /journal/i, isActive: { $ne: false } }).session(session));
        if (!vType) throw new ApiError(400, 'No Journal voucher type configured');
        const date = input.reversalDate ? new Date(input.reversalDate) : new Date();
        const voucherNo = await getNextVoucherNo(vType._id, date, session);

        // Full mirror of original lines when full reverse; otherwise component rebuild
        let lines;
        const isFull =
            Math.abs(totalRev - (Number(relMeta.totalReleased) || 0)) <= EPS;
        if (isFull) {
            lines = (relDoc.items || []).map((it) => ({
                ledgerId: it.ledgerId,
                amount: it.amount,
                type: it.type === 'Debit' ? 'Credit' : 'Debit',
                narration: `Reverse RCM ITC ${relDoc.voucherNo}`,
            }));
        } else {
            const LM = await resolveRcmLedgerMap(companyId, {
                igst: igstRev > EPS,
                includeInput: true,
                cess: cessRev > EPS,
            });
            lines = [];
            if (cgstRev > EPS) {
                lines.push({
                    ledgerId: LM.map.inputCgst._id,
                    amount: cgstRev,
                    type: 'Credit',
                    narration: 'Reverse Input CGST under RCM',
                });
            }
            if (sgstRev > EPS) {
                lines.push({
                    ledgerId: LM.map.inputSgst._id,
                    amount: sgstRev,
                    type: 'Credit',
                    narration: 'Reverse Input SGST under RCM',
                });
            }
            if (igstRev > EPS) {
                lines.push({
                    ledgerId: LM.map.inputIgst._id,
                    amount: igstRev,
                    type: 'Credit',
                    narration: 'Reverse Input IGST under RCM',
                });
            }
            if (cessRev > EPS) {
                lines.push({
                    ledgerId: LM.map.inputCess._id,
                    amount: cessRev,
                    type: 'Credit',
                    narration: 'Reverse Input Cess under RCM',
                });
            }
            const recoverableId = liabMeta.ledgerMap?.recoverableId || LM.map.recoverable?._id;
            lines.push({
                ledgerId: recoverableId,
                amount: totalRev,
                type: 'Debit',
                narration: 'Restore RCM GST Recoverable',
            });
        }

        const [rev] = await Voucher.create(
            [
                {
                    voucherNo,
                    voucherType: vType._id,
                    voucherTypeName: vType.name,
                    nature: 'Journal',
                    date,
                    financialYear: relDoc.financialYear,
                    companyId,
                    totalAmount: totalRev,
                    narration: `Reversal of RCM ITC ${relDoc.voucherNo}: ${reason}`,
                    status: 'Confirmed',
                    isSystemGenerated: true,
                    rcmLiabilityMeta: {
                        kind: 'RCM_ITC_RELEASE_REVERSAL',
                        reversesReleaseId: relDoc._id,
                        releasesPostingId: relMeta.releasesPostingId,
                        temporary,
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
            financialYear: relDoc.financialYear,
            session,
            label: 'RCM ITC Release Reversal',
        });

        relDoc.rcmLiabilityMeta = {
            ...relMeta,
            releaseStatus: 'REVERSED',
            reversedBy: input.userId || null,
            reversedAt: new Date(),
            reversalVoucherId: rev._id,
            reversalVoucherNumber: voucherNo,
            reversalReason: reason,
            temporaryReversal: temporary,
        };
        await relDoc.save({ session });

        const itcReleases = (liabMeta.itcReleases || []).map((r) => {
            if (String(r.releaseVoucherId) === String(relDoc._id)) {
                return {
                    ...r,
                    status: 'REVERSED',
                    reversalVoucherId: rev._id,
                    temporary,
                };
            }
            return r;
        });
        const nextMeta = {
            ...liabMeta,
            itcReleases,
            itcReview: {
                ...(liabMeta.itcReview || {}),
                eligibilityDecision: temporary
                    ? RCM_ITC_ELIGIBILITY.TEMPORARILY_REVERSED
                    : (liabMeta.itcReview?.eligibilityDecision || RCM_ITC_ELIGIBILITY.FULLY_ELIGIBLE),
            },
        };
        const itcStatus = deriveItcStatus(nextMeta);
        const auditHistory = [...(liabMeta.auditHistory || [])];
        auditHistory.push({
            at: new Date(),
            action: temporary ? 'ITC_TEMPORARILY_REVERSED' : 'ITC_RELEASE_REVERSED',
            userId: input.userId || null,
            detail: `Reversed ${relDoc.voucherNo} via ${voucherNo}: ${reason}`,
        });
        liabilityDoc.rcmLiabilityMeta = {
            ...nextMeta,
            itcStatus,
            lifecycleStatus: temporary
                ? RCM_LIFECYCLE.ITC_PENDING_ELIGIBILITY
                : RCM_LIFECYCLE.ITC_PENDING_ELIGIBILITY,
            auditHistory,
        };
        await liabilityDoc.save({ session });
        await session.commitTransaction();

        return {
            status: itcStatus,
            message: 'RCM ITC release reversed. Original release retained for audit. GSTR-3B was not claimed.',
            reversalVoucherNumber: voucherNo,
            posting: buildPostingResponseFromVoucher(liabilityDoc.toObject()),
            balances: computeItcBalances(liabilityDoc.rcmLiabilityMeta),
        };
    } catch (err) {
        await session.abortTransaction().catch(() => {});
        throw err;
    } finally {
        session.endSession();
    }
}

export function hasActiveRcmItcRelease(meta = {}) {
    return (meta.itcReleases || []).some((r) => r.status !== 'REVERSED');
}

export default {
    getItcEligibilityReview,
    saveItcEligibilityReview,
    previewItcRelease,
    releaseRcmItc,
    reverseRcmItcRelease,
    reclassifyIneligibleRcmTax,
    computeItcBalances,
    deriveItcStatus,
    buildItcReleaseIdempotencyKey,
    hasActiveRcmItcRelease,
    PHASE_2C_BANNER,
    RCM_ITC_ELIGIBILITY,
    RCM_ITC_STATUS,
};
