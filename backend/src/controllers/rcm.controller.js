import catchAsync from '../utils/catchAsync.js';
import { ApiError } from '../utils/ApiError.js';
import { RcmRule } from '../models/rcmRule.model.js';
import {
    evaluateRcmDecision,
    PHASE_2A_BANNER,
} from '../services/rcmDecisionEngine.service.js';
import { PLATFORM_DRAFT_RCM_RULES } from '../config/rcmDraftRules.seed.js';
import { simulateRcmAccounting } from '../services/rcmAccountingSimulation.service.js';
import {
    postRcmLiability,
    reverseRcmLiability,
    getRcmLiabilityPosting,
    evaluatePostingEligibility,
} from '../services/rcmLiabilityPosting.service.js';
import { ensureRcmLedgers, resolveRcmLedgerMap } from '../services/rcmLedgerEnsure.service.js';
import {
    recordRcmTaxPayment,
    reverseRcmTaxPayment,
    computeOutstanding,
    derivePaymentStatus,
    PHASE_2B_C_BANNER,
} from '../services/rcmTaxPayment.service.js';
import {
    getItcEligibilityReview,
    saveItcEligibilityReview,
    previewItcRelease,
    releaseRcmItc,
    reverseRcmItcRelease,
    reclassifyIneligibleRcmTax,
    PHASE_2C_BANNER,
} from '../services/rcmItcRelease.service.js';
import {
    buildRcmReconciliationRegister,
    prepareRcmReturnMapping,
    reviewRcmReturnMapping,
    approveRcmReturnMapping,
    includeApprovedRcmInDraftGstr3b,
    lockRcmGstr3bPeriod,
    createRcmGstr3bAmendment,
    buildRcmReconciliationExport,
    PHASE_2D_BANNER,
} from '../services/rcmGstr3bReconciliation.service.js';
import {
    PHASE_2B_A_BANNER,
    PHASE_2B_B_BANNER,
    PHASE_2B_C_BANNER as DESIGN_PHASE_2B_C,
    PROPOSED_RCM_LEDGERS,
    EXISTING_GST_LEDGER_NAMES,
    RCM_LIFECYCLE,
    RCM_PERMISSION_IDS,
    RCM_RULE_STORE_POLICY,
} from '../config/rcmAccountingDesign.js';

/** POST /api/v1/rcm/evaluate — preview only, never posts */
export const evaluateRcm = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId || null;
    const includeDraftRules = req.body.includeDraftRules === true || req.query.includeDraft === '1';

    const result = await evaluateRcmDecision(
        {
            ...req.body,
            companyId,
            override: req.body.override
                ? {
                      ...req.body.override,
                      userId: req.user?._id || req.user?.id,
                      user: req.user?.name || req.user?.email,
                      at: new Date().toISOString(),
                  }
                : null,
        },
        { includeDraftRules },
    );

    res.status(200).json({
        success: true,
        message: PHASE_2A_BANNER,
        data: result,
    });
});

export const listRcmRules = catchAsync(async (req, res) => {
    let rows = [];
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.category) filter.category = String(req.query.category).toUpperCase();
        rows = await RcmRule.find(filter).sort({ category: 1, ruleCode: 1, version: -1 }).lean();
    } catch {
        rows = [];
    }
    const codes = new Set(rows.map((r) => r.ruleCode));
    const seeds = PLATFORM_DRAFT_RCM_RULES.filter((s) => !codes.has(s.ruleCode));
    res.status(200).json({
        success: true,
        data: [...rows, ...seeds],
        banner: PHASE_2A_BANNER,
        note: 'Platform draft seeds are file-based when DB collection is unavailable.',
    });
});

export const getRcmRule = catchAsync(async (req, res) => {
    let row = null;
    try {
        row = await RcmRule.findById(req.params.id).lean();
    } catch {
        row = null;
    }
    if (!row) {
        row = PLATFORM_DRAFT_RCM_RULES.find(
            (s) => String(s._id) === String(req.params.id) || s.ruleCode === req.params.id,
        );
    }
    if (!row) throw new ApiError(404, 'RCM rule not found');
    res.status(200).json({ success: true, data: row });
});

/** Admin create — may fail if Atlas collection limit; seeds remain available. */
export const createRcmRule = catchAsync(async (req, res) => {
    const status = req.body.status || 'draft';
    if (status === 'active' && !['admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase())) {
        throw new ApiError(403, 'Only admin may create active RCM rules');
    }
    try {
        const row = await RcmRule.create({
            ...req.body,
            status,
            createdBy: req.user?._id,
            updatedBy: req.user?._id,
        });
        res.status(201).json({ success: true, data: row, banner: PHASE_2A_BANNER });
    } catch (err) {
        throw new ApiError(
            400,
            String(err?.message || '').includes('500 collections')
                ? 'Cannot create RcmRule collection (Atlas limit). Use platform draft seed file for Phase 2A.'
                : (err.message || 'Failed to create RCM rule'),
        );
    }
});

export const updateRcmRule = catchAsync(async (req, res) => {
    let row;
    try {
        row = await RcmRule.findById(req.params.id);
    } catch {
        row = null;
    }
    if (!row) {
        throw new ApiError(
            404,
            'RCM rule not found in DB. Platform draft seeds are read-only until a DB collection is available.',
        );
    }
    const fromStatus = row.status;
    const history = [...(row.amendmentHistory || [])];
    if (req.body.status === 'active' && row.status !== 'active') {
        row.approvedBy = req.user?._id;
        row.approvedAt = new Date();
        history.push({
            at: new Date(),
            action: 'APPROVED_ACTIVE',
            userId: req.user?._id || null,
            fromStatus,
            toStatus: 'active',
            detail: 'Rule activated in MongoDB (authoritative store)',
        });
    } else if (req.body.status && req.body.status !== row.status) {
        history.push({
            at: new Date(),
            action: 'STATUS_CHANGE',
            userId: req.user?._id || null,
            fromStatus,
            toStatus: req.body.status,
            detail: req.body.notes || '',
        });
    } else if (Object.keys(req.body || {}).length) {
        history.push({
            at: new Date(),
            action: 'AMENDED',
            userId: req.user?._id || null,
            fromStatus,
            toStatus: req.body.status || row.status,
            detail: 'Rule fields updated',
        });
    }
    Object.assign(row, req.body, {
        updatedBy: req.user?._id,
        amendmentHistory: history,
    });
    await row.save();
    res.status(200).json({
        success: true,
        data: row,
        banner: PHASE_2A_BANNER,
        ruleStorePolicy: RCM_RULE_STORE_POLICY,
    });
});

/**
 * POST /api/v1/rcm/simulate-accounting
 * Phase 2B-A — accounting simulation only. Never posts journals or changes balances.
 */
export const simulateRcmAccountingPreview = catchAsync(async (req, res) => {
    let decision = req.body.decision || null;
    if (!decision) {
        const companyId = req.companyId || req.body.companyId || null;
        decision = await evaluateRcmDecision(
            { ...req.body, companyId },
            { includeDraftRules: req.body.includeDraftRules === true },
        );
    }

    const sim = await simulateRcmAccounting({
        decision,
        rcmConfirmed: req.body.rcmConfirmed === true,
        expenseLedgerName: req.body.expenseLedgerName,
        supplierName: req.body.supplierName,
        taxableValue: req.body.taxableValue,
        gstType: req.body.gstType,
        rate: req.body.rate,
        supplierChargedGst: req.body.supplierChargedGst,
        cessAmount: req.body.cessAmount,
        taxPayment: req.body.taxPayment,
        itc: req.body.itc,
        rcmCategory: req.body.rcmCategory,
        cancellationScenario: req.body.cancellationScenario,
    });

    res.status(200).json({
        success: true,
        message: PHASE_2B_A_BANNER,
        data: sim,
    });
});

/** GET /api/v1/rcm/ledger-design — proposed vs existing GST ledger map (no create). */
export const getRcmLedgerDesign = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId || null;
    const resolved = companyId
        ? await resolveRcmLedgerMap(companyId, { igst: false })
        : null;
    res.status(200).json({
        success: true,
        message: PHASE_2B_A_BANNER,
        data: {
            existingGstLedgerNames: EXISTING_GST_LEDGER_NAMES,
            proposedRcmLedgers: PROPOSED_RCM_LEDGERS,
            createInThisPhase: false,
            companyMapping: resolved,
            lifecycle: RCM_LIFECYCLE,
            permissions: {
                usableNow: [
                    RCM_PERMISSION_IDS.evaluate,
                    RCM_PERMISSION_IDS.confirm,
                    RCM_PERMISSION_IDS.viewAccountingPreview,
                    RCM_PERMISSION_IDS.override,
                    RCM_PERMISSION_IDS.postLiability,
                    RCM_PERMISSION_IDS.reverse,
                ],
                inactiveUntilLater: [
                    RCM_PERMISSION_IDS.recordPayment,
                    RCM_PERMISSION_IDS.releaseItc,
                ],
            },
        },
    });
});

/** POST /api/v1/rcm/confirm — mark decision confirmed for posting gate (no journals). */
export const confirmRcmDecision = catchAsync(async (req, res) => {
    if (req.body.confirmed !== true) {
        throw new ApiError(400, 'confirmed=true is required');
    }
    const companyId = req.companyId || req.body.companyId || null;
    let decision = req.body.decision || null;
    if (!decision) {
        decision = await evaluateRcmDecision(
            { ...req.body, companyId },
            { includeDraftRules: false },
        );
    }
    const eligibility = await evaluatePostingEligibility({
        decision: { ...decision, rcmConfirmed: true },
        rcmConfirmed: true,
        companyId,
        sourceVoucherId: req.body.sourceVoucherId,
        taxableValue: req.body.taxableValue ?? decision.taxableValue,
        gstType: req.body.gstType,
        rate: req.body.rate ?? decision.suggestedGstRate,
        cessAmount: req.body.cessAmount,
    });
    res.status(200).json({
        success: true,
        message: 'RCM decision confirmation recorded for this request (preview). Posting requires a separate authorised action.',
        data: {
            rcmConfirmed: true,
            confirmedBy: req.user?._id,
            confirmedAt: new Date().toISOString(),
            decision,
            postingEligibility: eligibility,
        },
    });
});

/** POST /api/v1/rcm/ensure-ledgers — create RCM ledgers only with confirmCreate=true. */
export const ensureRcmLedgersController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await ensureRcmLedgers({
        companyId,
        userId: req.user?._id,
        confirmCreate: req.body.confirmCreate === true,
        includeOptionalCess: req.body.includeOptionalCess === true,
        includeInputLedgers: req.body.includeInputLedgers === true,
    });
    res.status(result.blocked ? 400 : 200).json({
        success: !result.blocked,
        message: result.message,
        data: result,
    });
});

/** POST /api/v1/rcm/posting-eligibility */
export const getPostingEligibility = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    let decision = req.body.decision || null;
    if (!decision) {
        decision = await evaluateRcmDecision(
            { ...req.body, companyId },
            { includeDraftRules: false },
        );
    }
    const eligibility = await evaluatePostingEligibility({
        ...req.body,
        decision,
        companyId,
        rcmConfirmed: req.body.rcmConfirmed === true,
    });
    res.status(200).json({ success: true, data: eligibility });
});

/** POST /api/v1/rcm/post-liability — authorised live RCM liability only. */
export const postRcmLiabilityController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    let decision = req.body.decision || null;
    if (!decision) {
        decision = await evaluateRcmDecision(
            { ...req.body, companyId },
            { includeDraftRules: false },
        );
    }
    const result = await postRcmLiability({
        ...req.body,
        decision,
        companyId,
        userId: req.user?._id,
        rcmConfirmed: req.body.rcmConfirmed === true,
        financialYear: req.body.financialYear || req.financialYear,
    });
    res.status(200).json({
        success: true,
        message: result.message || PHASE_2B_B_BANNER,
        data: result,
    });
});

/** GET /api/v1/rcm/postings */
export const listRcmPostings = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const rows = await getRcmLiabilityPosting({
        companyId,
        postingId: req.query.postingId,
        sourceVoucherId: req.query.sourceVoucherId,
    });
    res.status(200).json({ success: true, data: rows });
});

/** GET /api/v1/rcm/postings/:id */
export const getRcmPostingById = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const rows = await getRcmLiabilityPosting({
        companyId,
        postingId: req.params.id,
    });
    if (!rows.length) throw new ApiError(404, 'RCM posting not found');
    res.status(200).json({ success: true, data: rows[0] });
});

/** POST /api/v1/rcm/postings/:id/reverse */
export const reverseRcmLiabilityController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await reverseRcmLiability({
        companyId,
        postingId: req.params.id,
        userId: req.user?._id,
        confirmReverse: req.body.confirmReverse === true,
        remarks: req.body.remarks,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

/** POST /api/v1/rcm/postings/:id/record-payment — Phase 2B-C (no ITC) */
export const recordRcmTaxPaymentController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await recordRcmTaxPayment({
        ...req.body,
        companyId,
        liabilityPostingId: req.params.id,
        userId: req.user?._id,
        financialYear: req.body.financialYear || req.financialYear,
        confirmPayment: req.body.confirmPayment === true,
        checkboxAccepted: req.body.checkboxAccepted === true,
    });
    res.status(200).json({
        success: true,
        message: result.message || PHASE_2B_C_BANNER,
        data: result,
    });
});

/** GET /api/v1/rcm/postings/:id/payments */
export const listRcmTaxPaymentsController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const rows = await getRcmLiabilityPosting({
        companyId,
        postingId: req.params.id,
    });
    if (!rows.length) throw new ApiError(404, 'RCM posting not found');
    const posting = rows[0];
    const outstanding = computeOutstanding(posting);
    res.status(200).json({
        success: true,
        data: {
            posting,
            payments: (posting.payments || []).filter((p) => p.status !== 'REVERSED'),
            outstanding,
            paymentStatus: derivePaymentStatus(posting),
            banner: PHASE_2B_C_BANNER || DESIGN_PHASE_2B_C,
            itcStatus: posting.itcStatus || 'NOT_AVAILABLE_YET',
        },
    });
});

/** POST /api/v1/rcm/payments/:paymentId/reverse */
export const reverseRcmTaxPaymentController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await reverseRcmTaxPayment({
        companyId,
        paymentVoucherId: req.params.paymentId,
        userId: req.user?._id,
        confirmReverse: req.body.confirmReverse === true,
        reason: req.body.reason,
        reversalDate: req.body.reversalDate,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

/** GET /api/v1/rcm/postings/:id/itc-review — Phase 2C */
export const getItcReviewController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const data = await getItcEligibilityReview({
        companyId,
        liabilityPostingId: req.params.id,
    });
    res.status(200).json({ success: true, data });
});

/** POST /api/v1/rcm/postings/:id/itc-review */
export const saveItcReviewController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await saveItcEligibilityReview({
        ...req.body,
        companyId,
        liabilityPostingId: req.params.id,
        userId: req.user?._id,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

/** POST /api/v1/rcm/postings/:id/itc-release-preview */
export const previewItcReleaseController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await previewItcRelease({
        ...req.body,
        companyId,
        liabilityPostingId: req.params.id,
    });
    res.status(200).json({ success: true, data: result });
});

/** POST /api/v1/rcm/postings/:id/release-itc */
export const releaseItcController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await releaseRcmItc({
        ...req.body,
        companyId,
        liabilityPostingId: req.params.id,
        userId: req.user?._id,
        financialYear: req.body.financialYear || req.financialYear,
        confirmRelease: req.body.confirmRelease === true,
        checkboxAccepted: req.body.checkboxAccepted === true,
        confirmCreate: req.body.confirmCreate === true,
    });
    res.status(200).json({
        success: true,
        message: result.message || PHASE_2C_BANNER,
        data: result,
    });
});

/** GET /api/v1/rcm/postings/:id/itc-releases */
export const listItcReleasesController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const data = await getItcEligibilityReview({
        companyId,
        liabilityPostingId: req.params.id,
    });
    res.status(200).json({
        success: true,
        data: {
            releases: data.releases || [],
            balances: data.balances,
            itcStatus: data.itcStatus,
            banner: PHASE_2C_BANNER,
        },
    });
});

/** POST /api/v1/rcm/itc-releases/:releaseId/reverse */
export const reverseItcReleaseController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await reverseRcmItcRelease({
        companyId,
        releaseVoucherId: req.params.releaseId,
        userId: req.user?._id,
        confirmReverse: req.body.confirmReverse === true,
        reason: req.body.reason,
        reversalDate: req.body.reversalDate,
        temporary: req.body.temporary === true,
        cgstReversed: req.body.cgstReversed,
        sgstReversed: req.body.sgstReversed,
        igstReversed: req.body.igstReversed,
        cessReversed: req.body.cessReversed,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

/** POST /api/v1/rcm/postings/:id/reclassify-ineligible */
export const reclassifyIneligibleController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.body.companyId;
    const result = await reclassifyIneligibleRcmTax({
        ...req.body,
        companyId,
        liabilityPostingId: req.params.id,
        userId: req.user?._id,
        financialYear: req.body.financialYear || req.financialYear,
        confirmTreatment: req.body.confirmTreatment === true,
        checkboxAccepted: req.body.checkboxAccepted === true,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

/** GET /api/v1/rcm/gstr3b-reconciliation — Phase 2D */
export const getRcmGstr3bReconciliationController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const data = await buildRcmReconciliationRegister({
        companyId,
        returnPeriod: req.query.returnPeriod || req.body.returnPeriod,
        financialYear: req.query.financialYear || req.body.financialYear,
    });
    res.status(200).json({ success: true, message: PHASE_2D_BANNER, data });
});

export const prepareRcmReturnMappingController = catchAsync(async (req, res) => {
    const result = await prepareRcmReturnMapping({
        ...req.body,
        companyId: req.companyId || req.body.companyId,
        userId: req.user?._id,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

export const reviewRcmReturnMappingController = catchAsync(async (req, res) => {
    const result = await reviewRcmReturnMapping({
        ...req.body,
        companyId: req.companyId || req.body.companyId,
        userId: req.user?._id,
        enforceRoleSeparation: req.body.enforceRoleSeparation === true,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

export const approveRcmReturnMappingController = catchAsync(async (req, res) => {
    const result = await approveRcmReturnMapping({
        ...req.body,
        companyId: req.companyId || req.body.companyId,
        userId: req.user?._id,
        enforceRoleSeparation: req.body.enforceRoleSeparation === true,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

export const includeRcmInGstr3bController = catchAsync(async (req, res) => {
    const result = await includeApprovedRcmInDraftGstr3b({
        ...req.body,
        companyId: req.companyId || req.body.companyId,
        userId: req.user?._id,
        confirmInclude: req.body.confirmInclude === true,
        checkboxAccepted: req.body.checkboxAccepted === true,
    });
    const status = result.status === 'MANUAL_ADJUSTMENT_CONFLICT' ? 409 : 200;
    res.status(status).json({ success: status === 200, message: result.message, data: result });
});

export const lockRcmGstr3bPeriodController = catchAsync(async (req, res) => {
    const result = await lockRcmGstr3bPeriod({
        ...req.body,
        companyId: req.companyId || req.body.companyId,
        userId: req.user?._id,
        confirmLock: req.body.confirmLock === true,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

export const createRcmAmendmentController = catchAsync(async (req, res) => {
    const result = await createRcmGstr3bAmendment({
        ...req.body,
        companyId: req.companyId || req.body.companyId,
        userId: req.user?._id,
    });
    res.status(200).json({ success: true, message: result.message, data: result });
});

export const exportRcmReconciliationController = catchAsync(async (req, res) => {
    const companyId = req.companyId || req.query.companyId;
    const register = await buildRcmReconciliationRegister({
        companyId,
        returnPeriod: req.query.returnPeriod,
        financialYear: req.query.financialYear,
    });
    res.status(200).json({
        success: true,
        data: {
            rows: buildRcmReconciliationExport(register),
            summary: register.summary,
            banner: PHASE_2D_BANNER,
        },
    });
});
