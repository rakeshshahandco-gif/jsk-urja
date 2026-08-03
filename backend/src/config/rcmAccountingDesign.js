/**
 * Phase 2B-A — RCM accounting design constants (simulation only).
 * No live posting. Proposed ledger names are mapped, not auto-created.
 */

export const PHASE_2B_A_BANNER =
    'SIMULATION ONLY — NOT POSTED TO ACCOUNTS. RCM liability, payment and ITC are not written to ledgers in this phase.';

export const PHASE_2B_B_BANNER =
    'RCM Liability Posted — Return Mapping Pending. Tax payment and ITC release are not enabled in this phase.';

export const PHASE_2B_C_BANNER =
    'RCM Payment Recorded — GSTR-3B automatic update is not enabled in this phase. ITC is not released.';

export const PHASE_2C_BANNER =
    'RCM ITC Released in Books — GSTR-3B Mapping Pending. ITC is not marked as claimed in return.';

export const PHASE_2C_INELIGIBLE_BANNER =
    'RCM ITC marked Ineligible/Blocked — no Input GST under RCM posted. Recoverable balance retained until authorised reclassification.';

export const PHASE_2D_BANNER =
    'PREVIEW ONLY — NOT YET INCLUDED IN GSTR-3B. Inclusion requires prepare → review → approve → include.';

export const PHASE_2D_INCLUDED_BANNER =
    'Approved RCM figures included in draft GSTR-3B working data. Return is not filed. Non-RCM figures unchanged.';

/** Production durability: MongoDB is authoritative for approved RCM rules. File store = localhost/fallback only. */
export const RCM_RULE_STORE_POLICY = Object.freeze({
    authoritativeStore: 'mongodb',
    fileStoreRoles: ['localhost_dev', 'inactive_draft_suggestions', 'test_fixtures', 'read_only_fallback_with_warning'],
    silentMigrationForbidden: true,
    silentActivationForbidden: true,
});

export const GSTR3B_PREVIEW_BANNER =
    'GSTR-3B Preview Only — Not Included in Return';

export const GSTR3B_POSTED_BANNER =
    'RCM Liability Posted — Return Mapping Pending';

/** Full RCM lifecycle — not a single boolean. */
export const RCM_LIFECYCLE = Object.freeze({
    NOT_APPLICABLE: 'NOT_APPLICABLE',
    EVALUATION_PENDING: 'EVALUATION_PENDING',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    RCM_CONFIRMED: 'RCM_CONFIRMED',
    LIABILITY_CREATED: 'LIABILITY_CREATED',
    TAX_PAYMENT_PENDING: 'TAX_PAYMENT_PENDING',
    TAX_PAID: 'TAX_PAID',
    ITC_PENDING_ELIGIBILITY: 'ITC_PENDING_ELIGIBILITY',
    ITC_AVAILABLE: 'ITC_AVAILABLE',
    ITC_CLAIMED: 'ITC_CLAIMED',
    ITC_INELIGIBLE: 'ITC_INELIGIBLE',
    REVERSED: 'REVERSED',
    CANCELLED: 'CANCELLED',
});

export const RCM_LIFECYCLE_LABELS = Object.freeze({
    NOT_APPLICABLE: 'Not Applicable',
    EVALUATION_PENDING: 'Evaluation Pending',
    REVIEW_REQUIRED: 'Review Required',
    RCM_CONFIRMED: 'RCM Confirmed',
    LIABILITY_CREATED: 'Liability Created',
    TAX_PAYMENT_PENDING: 'Tax Payment Pending',
    TAX_PAID: 'Tax Paid',
    ITC_PENDING_ELIGIBILITY: 'ITC Pending Eligibility',
    ITC_AVAILABLE: 'ITC Available',
    ITC_CLAIMED: 'ITC Claimed',
    ITC_INELIGIBLE: 'ITC Ineligible',
    REVERSED: 'Reversed',
    CANCELLED: 'Cancelled',
});

/**
 * Existing chart (accountInitializer): Duties & Taxes → GST Collection / GST Input.
 * No RCM-specific ledgers exist today. Proposed names for future Phase 2B-B create.
 */
export const EXISTING_GST_LEDGER_NAMES = Object.freeze({
    output: ['CGST Output', 'SGST Output', 'IGST Output', 'GST Output'],
    input: ['CGST Input', 'SGST Input', 'IGST Input', 'GST Input Credit'],
    groups: ['Duties & Taxes', 'GST Collection', 'GST Input'],
});

/** Proposed company-wise RCM ledger map — DO NOT auto-create in 2B-A. */
export const PROPOSED_RCM_LEDGERS = Object.freeze({
    groups: [
        { name: 'GST RCM Liability', parent: 'Duties & Taxes', nature: 'Liabilities' },
        { name: 'GST RCM Input', parent: 'Duties & Taxes', nature: 'Liabilities' },
        { name: 'GST RCM Control', parent: 'Duties & Taxes', nature: 'Liabilities' },
    ],
    liability: {
        cgst: { name: 'RCM CGST Payable', group: 'GST RCM Liability' },
        sgst: { name: 'RCM SGST Payable', group: 'GST RCM Liability' },
        igst: { name: 'RCM IGST Payable', group: 'GST RCM Liability' },
        cess: { name: 'RCM Cess Payable', group: 'GST RCM Liability', optional: true },
    },
    input: {
        cgst: { name: 'Input CGST under RCM', group: 'GST RCM Input' },
        sgst: { name: 'Input SGST under RCM', group: 'GST RCM Input' },
        igst: { name: 'Input IGST under RCM', group: 'GST RCM Input' },
        cess: { name: 'Input Cess under RCM', group: 'GST RCM Input', optional: true },
    },
    control: {
        recoverable: { name: 'RCM GST Recoverable', group: 'GST RCM Control' },
    },
    /** Explicitly excluded from RCM simulation postings */
    doNotUse: ['CGST Input', 'SGST Input', 'IGST Input', 'CGST Output', 'SGST Output', 'IGST Output'],
});

/** Permission ids — GSTR-3B claim remains unwired. */
export const RCM_PERMISSION_IDS = Object.freeze({
    evaluate: 'gst.rcm.evaluate',
    confirm: 'gst.rcm.confirm',
    viewAccountingPreview: 'gst.rcm.view_accounting_preview',
    postLiability: 'gst.rcm.post_liability',
    viewPayment: 'gst.rcm.view_payment',
    recordPayment: 'gst.rcm.record_payment',
    reversePayment: 'gst.rcm.reverse_payment',
    viewItcReview: 'gst.rcm.view_itc_review',
    reviewItc: 'gst.rcm.review_itc',
    releaseItc: 'gst.rcm.release_itc',
    reverseItc: 'gst.rcm.reverse_itc',
    viewReconciliation: 'gst.rcm.view_reconciliation',
    prepareReturnMapping: 'gst.rcm.prepare_return_mapping',
    reviewReturnMapping: 'gst.rcm.review_return_mapping',
    approveReturnMapping: 'gst.rcm.approve_return_mapping',
    includeInGstr3b: 'gst.rcm.include_in_gstr3b',
    lockPeriod: 'gst.rcm.lock_period',
    createAmendment: 'gst.rcm.create_amendment',
    reverse: 'gst.rcm.reverse',
    override: 'gst.rcm.override',
    ensureLedgers: 'gst.rcm.post_liability',
});

export const RCM_POSTING_STATUS = Object.freeze({
    POSTED: 'POSTED',
    ALREADY_POSTED: 'ALREADY_POSTED',
    REVERSED: 'REVERSED',
    BLOCKED: 'BLOCKED',
});

/** Phase 2C — eligibility decision values */
export const RCM_ITC_ELIGIBILITY = Object.freeze({
    PENDING_REVIEW: 'PENDING_REVIEW',
    FULLY_ELIGIBLE: 'FULLY_ELIGIBLE',
    PARTLY_ELIGIBLE: 'PARTLY_ELIGIBLE',
    INELIGIBLE: 'INELIGIBLE',
    BLOCKED: 'BLOCKED',
    TEMPORARILY_REVERSED: 'TEMPORARILY_REVERSED',
});

/** Phase 2C — ITC workflow / release status */
export const RCM_ITC_STATUS = Object.freeze({
    PENDING_ELIGIBILITY_REVIEW: 'PENDING_ELIGIBILITY_REVIEW',
    ELIGIBLE_NOT_RELEASED: 'ELIGIBLE_NOT_RELEASED',
    PARTLY_RELEASED: 'PARTLY_RELEASED',
    RELEASED: 'RELEASED',
    INELIGIBLE: 'INELIGIBLE',
    BLOCKED: 'BLOCKED',
    TEMPORARILY_REVERSED: 'TEMPORARILY_REVERSED',
    RELEASE_REVERSED: 'RELEASE_REVERSED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    NOT_AVAILABLE_YET: 'NOT_AVAILABLE_YET',
});

/**
 * Ineligible/blocked reclassification — never auto-chosen.
 * NONE = status only; Recoverable retained until later authorised treatment.
 */
export const RCM_INELIGIBLE_TREATMENT = Object.freeze({
    NONE: 'NONE',
    TO_EXPENSE: 'TO_EXPENSE',
    TO_INELIGIBLE_GST_EXPENSE: 'TO_INELIGIBLE_GST_EXPENSE',
    TO_ASSET_PROJECT: 'TO_ASSET_PROJECT',
    TO_OTHER_LEDGER: 'TO_OTHER_LEDGER',
});

/** Phase 2D — liability return mapping statuses */
export const RCM_LIABILITY_RETURN_STATUS = Object.freeze({
    NOT_EVALUATED: 'NOT_EVALUATED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    CONFIRMED: 'CONFIRMED',
    POSTED: 'POSTED',
    PARTLY_PAID: 'PARTLY_PAID',
    PAID: 'PAID',
    PROPOSED_FOR_RETURN: 'PROPOSED_FOR_RETURN',
    APPROVED_FOR_RETURN: 'APPROVED_FOR_RETURN',
    INCLUDED_IN_RETURN: 'INCLUDED_IN_RETURN',
    FILED: 'FILED',
    REVERSED: 'REVERSED',
    EXCLUDED: 'EXCLUDED',
});

/** Phase 2D — ITC return mapping statuses */
export const RCM_ITC_RETURN_STATUS = Object.freeze({
    NOT_ELIGIBLE_YET: 'NOT_ELIGIBLE_YET',
    PENDING_REVIEW: 'PENDING_REVIEW',
    ELIGIBLE: 'ELIGIBLE',
    PARTLY_ELIGIBLE: 'PARTLY_ELIGIBLE',
    RELEASED_IN_BOOKS: 'RELEASED_IN_BOOKS',
    PROPOSED_FOR_RETURN: 'PROPOSED_FOR_RETURN',
    APPROVED_FOR_RETURN: 'APPROVED_FOR_RETURN',
    INCLUDED_IN_RETURN: 'INCLUDED_IN_RETURN',
    CLAIMED: 'CLAIMED',
    REVERSED: 'REVERSED',
    BLOCKED: 'BLOCKED',
    INELIGIBLE: 'INELIGIBLE',
});

export const RCM_RETURN_WORKFLOW = Object.freeze({
    DRAFT: 'DRAFT',
    PREPARED: 'PREPARED',
    REVIEWED: 'REVIEWED',
    APPROVED: 'APPROVED',
    INCLUDED_IN_DRAFT_RETURN: 'INCLUDED_IN_DRAFT_RETURN',
    FILED_LOCKED: 'FILED_LOCKED',
});

export const RCM_MANUAL_ADJ_OPTIONS = Object.freeze({
    KEEP_MANUAL: 'KEEP_MANUAL',
    REPLACE_WITH_APPROVED: 'REPLACE_WITH_APPROVED',
    ADD_ONLY_DIFFERENCE: 'ADD_ONLY_DIFFERENCE',
    EXCLUDE_CURRENT_BATCH: 'EXCLUDE_CURRENT_BATCH',
});
