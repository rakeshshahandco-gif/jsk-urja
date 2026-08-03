/**
 * Phase 2A — Transaction-wise RCM evaluation (preview only).
 * NEVER posts GST liability, Input GST, supplier payable, or GSTR-3B.
 */

import { RcmRule } from '../models/rcmRule.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Company } from '../models/company.model.js';
import { PLATFORM_DRAFT_RCM_RULES } from '../config/rcmDraftRules.seed.js';
import {
    listApprovedRcmRulesFile,
    upsertApprovedRcmRuleFile,
} from './rcmApprovedRulesFile.store.js';
import {
    normalizePropertyType,
    normalizeTransportServiceType,
    normalizeRcmCategory,
    normalizeSupplierTaxOption,
    normalizeSupplierGstStatus,
    conditionListMatch,
} from '../config/rcmCanonicalEnums.js';
import { ApiError } from '../utils/ApiError.js';

export const RCM_TREATMENTS = Object.freeze({
    FORWARD_CHARGE: 'FORWARD_CHARGE',
    REVERSE_CHARGE: 'REVERSE_CHARGE',
    EXEMPT: 'EXEMPT',
    NON_GST: 'NON_GST',
    NOT_APPLICABLE: 'NOT_APPLICABLE',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

export const PHASE_2A_BANNER =
    'RCM evaluation is for review only. Accounting posting is not enabled in this phase.';

const DISPLAY = {
    FORWARD_CHARGE: 'Forward Charge',
    REVERSE_CHARGE: 'Reverse Charge',
    EXEMPT: 'Exempt',
    NON_GST: 'Non-GST',
    NOT_APPLICABLE: 'Not Applicable',
    REVIEW_REQUIRED: 'Review Required',
};

function norm(s) {
    return String(s || '').trim();
}

function upper(s) {
    return norm(s).toUpperCase();
}

function hasGstin(value) {
    return norm(value).length >= 15;
}

function parseDate(d) {
    if (!d) return new Date();
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? new Date() : x;
}

function inEffectiveWindow(rule, txnDate) {
    const from = rule.effectiveFrom ? new Date(rule.effectiveFrom) : null;
    const to = rule.effectiveTo ? new Date(rule.effectiveTo) : null;
    if (from && txnDate < from) return false;
    if (to && txnDate > to) return false;
    return true;
}

function listMatch(conditionList, value, normalizer) {
    return conditionListMatch(conditionList, value, normalizer);
}

/**
 * Ensure localhost/file-store has approved Rent + GTA fixture rules when Mongo is empty.
 * Idempotent; does not touch Mongo; does not unlock periods.
 * NEVER runs in production — MongoDB RcmRule is the only production authority.
 */
export function ensureApprovedFixtureRules({ companyId } = {}) {
    if (process.env.NODE_ENV === 'production') return;
    // Global fixtures (companyId null) — visible to every company via listApprovedRcmRulesFile filter
    const existing = listApprovedRcmRulesFile({ companyId: null });
    const allForCompany = listApprovedRcmRulesFile({ companyId });
    const pool = [...existing, ...allForCompany];
    const hasRent = pool.some((r) => r.ruleCode === 'RENT_COMMERCIAL_UR_RECIPIENT_REG_APPROVED');
    const hasGta = pool.some((r) => r.ruleCode === 'GTA_CONSIGNMENT_RECIPIENT_LIABLE_APPROVED');
    const base = {
        companyId: null,
        status: 'active',
        effectiveFrom: '2017-07-01',
        approvedBy: 'platform-fixture',
        approvedAt: '2017-07-01T00:00:00.000Z',
        version: 1,
    };
    if (!hasRent) {
        upsertApprovedRcmRuleFile({
            ...base,
            ruleCode: 'RENT_COMMERCIAL_UR_RECIPIENT_REG_APPROVED',
            category: 'RENT',
            title: 'Commercial rent — unregistered supplier → registered recipient (approved fixture)',
            supplierRegistrationCondition: ['Unregistered'],
            recipientRegistrationCondition: ['Registered'],
            propertyTypeCondition: ['Commercial'],
            supplierGstChargedCondition: 'NO',
            decisionIfMatched: 'REVERSE_CHARGE',
            ratePercent: 18,
            statutoryReference: 'NN-13/2017 — renting of immovable property (approved fixture)',
        });
    }
    if (!hasGta) {
        upsertApprovedRcmRuleFile({
            ...base,
            ruleCode: 'GTA_CONSIGNMENT_RECIPIENT_LIABLE_APPROVED',
            category: 'GTA',
            title: 'GTA with consignment note — recipient liable (approved fixture)',
            supplierRegistrationCondition: [],
            recipientRegistrationCondition: ['Registered'],
            transportServiceTypeCondition: ['GTA', 'GTA with consignment note'],
            supplierTaxOptionCondition: ['Reverse Charge', 'RCM', 'Transaction-wise'],
            consignmentNoteRequired: true,
            supplierGstChargedCondition: 'ANY',
            decisionIfMatched: 'REVERSE_CHARGE',
            ratePercent: 5,
            statutoryReference: 'NN-13/2017 — GTA reverse charge (approved fixture)',
        });
    }
}

function hsnMatch(conditionList, hsn) {
    if (!conditionList || !conditionList.length) return true;
    const h = upper(hsn);
    if (!h) return false;
    return conditionList.some((c) => {
        const p = upper(c);
        return h === p || h.startsWith(p);
    });
}

function recipientRegistered(company) {
    return hasGstin(company?.gstNumber);
}

function mapSupplierRegStatus(supplier, partyLedger) {
    const fromSupplier = norm(supplier?.gstRegistrationStatus);
    if (fromSupplier) return fromSupplier;
    const rt = norm(partyLedger?.registrationType);
    if (rt === 'Unregistered' || rt === 'Consumer') return 'Unregistered';
    if (rt === 'Composition') return 'Composition';
    if (rt === 'Regular' && hasGstin(partyLedger?.gstin || supplier?.gstNumber)) {
        return 'Registered Regular';
    }
    if (hasGstin(supplier?.gstNumber || partyLedger?.gstin)) return 'Registered Regular';
    if (!hasGstin(supplier?.gstNumber || partyLedger?.gstin) && (supplier || partyLedger)) {
        return 'Unregistered';
    }
    return '';
}

function serializeMatchedRule(rule, source = 'mongodb') {
    if (!rule) return null;
    return {
        _id: rule._id || rule.id || null,
        id: rule._id || rule.id || null,
        ruleCode: rule.ruleCode,
        title: rule.title,
        category: rule.category,
        status: rule.status,
        version: rule.version ?? 1,
        effectiveFrom: rule.effectiveFrom || null,
        effectiveTo: rule.effectiveTo || null,
        statutoryReference: rule.statutoryReference || '',
        approvedBy: rule.approvedBy || null,
        approvedAt: rule.approvedAt || null,
        source,
    };
}

function buildEmptyResult(partial = {}) {
    return {
        phase: '2A_PREVIEW_ONLY',
        postingEnabled: false,
        banner: PHASE_2A_BANNER,
        treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
        treatmentLabel: DISPLAY.REVIEW_REQUIRED,
        suggestedTreatment: null,
        suggestedTreatmentLabel: null,
        rcmCategory: null,
        supplierGstStatus: '',
        supplierGstOption: '',
        placeOfSupply: '',
        taxableValue: 0,
        suggestedGstRate: null,
        suggestedCgst: 0,
        suggestedSgst: 0,
        suggestedIgst: 0,
        itcDefault: null,
        decisionReason: '',
        missingInformation: [],
        warnings: [],
        matchedRule: null,
        matchedDraftRule: null,
        matchedConditions: [],
        missingConditions: [],
        overriddenValues: [],
        statutoryReference: '',
        effectiveDate: null,
        confidence: 'low',
        statusText: 'Not Enough Information — Review Required',
        ...partial,
    };
}

function taxSplit(taxable, rate, gstType) {
    const r = Number(rate) || 0;
    const t = Math.round(((taxable * r) / 100) * 100) / 100;
    const isIgst = String(gstType || '').toUpperCase().includes('IGST');
    if (isIgst) return { suggestedCgst: 0, suggestedSgst: 0, suggestedIgst: t };
    const half = Math.round((t / 2) * 100) / 100;
    return { suggestedCgst: half, suggestedSgst: half, suggestedIgst: 0 };
}

function scoreRule(rule, ctx) {
    const matched = [];
    const missing = [];

    if (!listMatch(rule.supplierRegistrationCondition, ctx.supplierGstStatus, normalizeSupplierGstStatus)) {
        return null;
    }
    matched.push(`supplierRegistration=${ctx.supplierGstStatus || '(any)'}`);

    const recip = ctx.recipientRegistered ? 'Registered' : 'Unregistered';
    if (rule.recipientRegistrationCondition?.length) {
        const ok = rule.recipientRegistrationCondition.some((c) => {
            const x = norm(c).toLowerCase();
            if (x.startsWith('reg')) return ctx.recipientRegistered;
            if (x.startsWith('unreg')) return !ctx.recipientRegistered;
            return x === recip.toLowerCase();
        });
        if (!ok) return null;
        matched.push(`recipientRegistration=${recip}`);
    }

    if (!listMatch(rule.supplierTaxOptionCondition, ctx.supplierGstOption, normalizeSupplierTaxOption)) {
        return null;
    }
    if (rule.supplierTaxOptionCondition?.length) {
        matched.push(`supplierTaxOption=${ctx.supplierGstOption}`);
    }

    if (!hsnMatch(rule.hsnSacCondition, ctx.hsnSac)) {
        return null;
    }
    if (rule.hsnSacCondition?.length) {
        matched.push(`hsnSac=${ctx.hsnSac}`);
    }

    if (!listMatch(rule.placeOfSupplyCondition, ctx.placeOfSupply)) {
        return null;
    }

    if (rule.propertyTypeCondition?.length) {
        if (!listMatch(rule.propertyTypeCondition, ctx.propertyType, normalizePropertyType)) {
            if (!ctx.propertyType) missing.push('propertyType');
            else return null;
        } else matched.push(`propertyType=${ctx.propertyType}`);
    }

    if (rule.transportServiceTypeCondition?.length) {
        if (!listMatch(
            rule.transportServiceTypeCondition,
            ctx.transportServiceType,
            (v) => normalizeTransportServiceType(v, {
                consignmentNoteAvailable: ctx.consignmentNoteAvailable,
            }),
        )) {
            if (!ctx.transportServiceType) missing.push('transportServiceType');
            else return null;
        } else matched.push(`transportServiceType=${ctx.transportServiceType}`);
    }

    if (rule.consignmentNoteRequired) {
        if (ctx.consignmentNoteAvailable !== true && ctx.consignmentNoteAvailable !== 'YES') {
            missing.push('consignmentNoteAvailable');
        } else matched.push('consignmentNoteAvailable=YES');
    }

    if (rule.supplierGstChargedCondition === 'YES') {
        if (ctx.supplierGstCharged !== true && ctx.supplierGstCharged !== 'YES') {
            missing.push('supplierGstCharged');
        } else matched.push('supplierGstCharged=YES');
    }
    if (rule.supplierGstChargedCondition === 'NO') {
        if (ctx.supplierGstCharged === true || ctx.supplierGstCharged === 'YES') return null;
        matched.push('supplierGstCharged=NO');
    }

    // Hard safety: blank GSTIN alone never matches an RCM decision
    if (
        rule.decisionIfMatched === RCM_TREATMENTS.REVERSE_CHARGE
        && !hasGstin(ctx.supplierGstin)
        && !ctx.supplierGstStatus
        && !ctx.rcmCategory
        && !ctx.propertyType
        && !ctx.transportServiceType
        && !ctx.ledgerRcmCandidate
    ) {
        return null;
    }

    return { rule, matched, missing };
}

/**
 * @param {object} input
 * @param {object} [options]
 * @param {boolean} [options.includeDraftRules] — evaluate draft/inactive for preview hints only
 */
export async function evaluateRcmDecision(input = {}, options = {}) {
    const includeDraft = options.includeDraftRules === true;
    const txnDate = parseDate(input.transactionDate);
    const companyId = input.companyId || null;

    // Canonical enum normalisation — reject unsupported values (no silent COMMERCIAL_RENT vs Commercial mismatch)
    const propN = normalizePropertyType(input.propertyType);
    if (propN.error) throw new ApiError(400, propN.error);
    const catN = normalizeRcmCategory(input.rcmCategory || input.rcmCategoryHint);
    if (catN.error) throw new ApiError(400, catN.error);
    const taxOptN = normalizeSupplierTaxOption(
        input.supplierGstOption || input.supplierTaxOption,
    );
    if (taxOptN.error) throw new ApiError(400, taxOptN.error);
    const statusN = normalizeSupplierGstStatus(input.supplierGstStatus);
    if (statusN.error) throw new ApiError(400, statusN.error);
    const transportN = normalizeTransportServiceType(input.transportServiceType, {
        consignmentNoteAvailable: input.consignmentNoteAvailable,
    });
    if (transportN.error) throw new ApiError(400, transportN.error);

    const [company, expenseLedger, partyLedger, supplier] = await Promise.all([
        companyId ? Company.findById(companyId).lean() : null,
        input.expenseLedgerId
            ? AccountLedger.findById(input.expenseLedgerId).lean()
            : input.ledgerId
              ? AccountLedger.findById(input.ledgerId).lean()
              : null,
        input.partyLedgerId ? AccountLedger.findById(input.partyLedgerId).lean() : null,
        input.supplierId
            ? Supplier.findById(input.supplierId).lean()
            : null,
    ]);

    const supplierGstin = norm(
        input.supplierGstin || supplier?.gstNumber || partyLedger?.gstin || '',
    );
    const supplierGstStatus =
        statusN.value
        || normalizeSupplierGstStatus(mapSupplierRegStatus(supplier, partyLedger)).value
        || mapSupplierRegStatus(supplier, partyLedger);
    const supplierGstOption = taxOptN.value || norm(supplier?.supplierChargesGst) || '';
    const placeOfSupply =
        norm(input.placeOfSupply)
        || norm(supplier?.defaultPlaceOfSupply)
        || norm(partyLedger?.state)
        || norm(supplier?.state)
        || '';
    const hsnSac =
        norm(input.hsnSac) || norm(expenseLedger?.defaultHsnSac) || norm(expenseLedger?.hsnCode) || '';
    const taxableValue = Number(input.taxableValue) || 0;
    const gstType = input.gstType || 'CGST / SGST';
    const rate =
        input.suggestedGstRate != null
            ? Number(input.suggestedGstRate)
            : Number(expenseLedger?.gstRate) || null;

    const ledgerTreatment = norm(expenseLedger?.gstTreatmentDefault) || 'TRANSACTION_WISE';
    const ledgerRcmCandidate = !!expenseLedger?.rcmCandidate;
    let rcmCategory =
        catN.value || norm(expenseLedger?.defaultRcmCategory) || '';
    const itcDefault = norm(expenseLedger?.defaultItcEligibility) || null;
    const propertyType = propN.value || '';
    let transportServiceType = transportN.value || '';

    // Infer category from normalised signals when UI omitted rcmCategory
    if (!rcmCategory && propertyType) rcmCategory = 'RENT';
    if (!rcmCategory && /gta/i.test(transportServiceType)) rcmCategory = 'GTA';
    if (!rcmCategory && /courier/i.test(transportServiceType)) rcmCategory = 'COURIER';

    const ctx = {
        supplierGstin,
        supplierGstStatus,
        supplierGstOption,
        placeOfSupply,
        hsnSac,
        propertyType,
        transportServiceType,
        consignmentNoteAvailable: input.consignmentNoteAvailable,
        supplierGstCharged: input.supplierGstCharged,
        rcmCategory,
        ledgerRcmCandidate,
        recipientRegistered: recipientRegistered(company),
        companyState: norm(company?.state),
    };

    const warnings = [];
    const missingInformation = [];

    // ── Hard rules that never use blank GSTIN alone ───────────────────────
    if (ledgerTreatment === 'NON_GST' || (expenseLedger && expenseLedger.gstApplicable === false && !ledgerRcmCandidate)) {
        return buildEmptyResult({
            treatment: RCM_TREATMENTS.NON_GST,
            treatmentLabel: DISPLAY.NON_GST,
            suggestedTreatment: RCM_TREATMENTS.NON_GST,
            suggestedTreatmentLabel: DISPLAY.NON_GST,
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            itcDefault,
            decisionReason: 'Ledger GST treatment / applicability indicates Non-GST.',
            confidence: 'high',
            statusText: 'Non-GST',
            matchedConditions: [`ledgerTreatment=${ledgerTreatment || 'gstApplicable=false'}`],
        });
    }

    if (
        ledgerTreatment === 'EXEMPT'
        || ledgerTreatment === 'NIL_RATED'
        || norm(input.ledgerGstTreatment) === 'EXEMPT'
    ) {
        return buildEmptyResult({
            treatment: RCM_TREATMENTS.EXEMPT,
            treatmentLabel: DISPLAY.EXEMPT,
            suggestedTreatment: RCM_TREATMENTS.EXEMPT,
            suggestedTreatmentLabel: DISPLAY.EXEMPT,
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            rcmCategory,
            itcDefault,
            decisionReason: `Ledger default treatment is ${ledgerTreatment === 'TRANSACTION_WISE' ? input.ledgerGstTreatment || ledgerTreatment : ledgerTreatment}.`,
            confidence: 'high',
            statusText: 'Exempt',
            matchedConditions: [`ledgerTreatment=${ledgerTreatment}`],
        });
    }

    // Forward charge when supplier already charges valid GST on the document
    const supplierChargedGst =
        input.supplierGstCharged === true
        || input.supplierGstCharged === 'YES'
        || (Number(input.documentGstAmount) || 0) > 0
        || supplierGstOption === 'Forward Charge';

    if (supplierChargedGst && (hasGstin(supplierGstin) || /registered/i.test(supplierGstStatus))) {
        const split = taxSplit(taxableValue, rate, gstType);
        return buildEmptyResult({
            treatment: RCM_TREATMENTS.FORWARD_CHARGE,
            treatmentLabel: DISPLAY.FORWARD_CHARGE,
            suggestedTreatment: RCM_TREATMENTS.FORWARD_CHARGE,
            suggestedTreatmentLabel: DISPLAY.FORWARD_CHARGE,
            supplierGstStatus,
            supplierGstOption: supplierGstOption || 'Forward Charge',
            placeOfSupply,
            taxableValue,
            suggestedGstRate: rate,
            ...split,
            rcmCategory,
            itcDefault: itcDefault || 'Eligible',
            decisionReason:
                'Supplier is registered and charges / opts for forward GST. No duplicate RCM suggested.',
            confidence: 'high',
            statusText: 'Forward Charge',
            matchedConditions: [
                'supplierGstChargedOrOption=Forward',
                `supplierGstin=${supplierGstin ? 'present' : 'absent'}`,
            ],
            warnings:
                ledgerRcmCandidate
                    ? ['Ledger is RCM candidate but forward-charge invoice takes priority.']
                    : [],
        });
    }

    // Explicit: blank GSTIN alone never triggers RCM — but do NOT treat missing ledger as non-GST
    const hasRcmSignals = !!(
        rcmCategory
        || propertyType
        || transportServiceType
        || ledgerRcmCandidate
        || ledgerTreatment === 'RCM_CANDIDATE'
    );
    if (!hasGstin(supplierGstin) && !hasRcmSignals) {
        if (!supplierGstStatus || supplierGstStatus === 'Unregistered') {
            warnings.push('Blank GSTIN / unregistered alone does not create RCM.');
        }
        if (expenseLedger && expenseLedger.gstApplicable === false) {
            return buildEmptyResult({
                treatment: RCM_TREATMENTS.NOT_APPLICABLE,
                treatmentLabel: DISPLAY.NOT_APPLICABLE,
                supplierGstStatus,
                supplierGstOption,
                placeOfSupply,
                taxableValue,
                decisionReason: 'GST not applicable on ledger; blank GSTIN does not trigger RCM.',
                warnings,
                confidence: 'high',
                statusText: 'Not Applicable',
            });
        }
    }

    // Courier must never inherit GTA solely from ledger name
    const transportType = ctx.transportServiceType;
    if (/courier/i.test(transportType) || /courier/i.test(rcmCategory)) {
        warnings.push('Courier / non-GTA transport is evaluated separately from GTA RCM.');
    }

    const statusFilter = includeDraft
        ? { status: { $in: ['active', 'draft', 'inactive'] } }
        : { status: 'active' };

    let rules = [];
    let mongoOk = true;
    let ruleStoreWarning = null;
    try {
        rules = await RcmRule.find({
            ...statusFilter,
            $or: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
        })
            .sort({ version: -1 })
            .lean();
    } catch {
        rules = [];
        mongoOk = false;
    }

    // Merge file-store approved rules only outside production (Mongo is production authority).
    // Previously file store was skipped when includeDraft=true — that hid approved fixtures from the UI.
    if (process.env.NODE_ENV !== 'production') {
        ensureApprovedFixtureRules({ companyId });
        const fileApproved = listApprovedRcmRulesFile({ companyId }).map((r) => ({
            ...r,
            status: 'active',
            source: 'file_store',
        }));
        if (fileApproved.length) {
            const mongoCodes = new Set(rules.filter((r) => r.status === 'active').map((r) => r.ruleCode));
            const extras = fileApproved.filter((r) => !mongoCodes.has(r.ruleCode));
            rules = [...rules, ...extras];
            if (!mongoOk || !rules.some((r) => r.source !== 'file_store' && r.status === 'active')) {
                ruleStoreWarning =
                    'Using file-store approved RCM rules (Mongo empty or unavailable). Approve rules in Mongo for production durability.';
            }
        }
    } else if (!mongoOk || !rules.some((r) => r.status === 'active')) {
        ruleStoreWarning =
            'No active MongoDB RcmRule found. File-store rules are disabled in production. Approve rules in MongoDB before posting.';
    }

    // Platform draft seeds — preview/fixture only; never auto-activated as law.
    const dbCodes = new Set(rules.map((r) => r.ruleCode));
    const seedExtra = PLATFORM_DRAFT_RCM_RULES.filter((s) => {
        if (dbCodes.has(s.ruleCode)) return false;
        if (!includeDraft && s.status !== 'active') return false;
        return true;
    }).map((s) => ({ ...s, source: 'platform_draft_seed' }));
    rules = [...rules, ...seedExtra];

    const categoryHint = (() => {
        const cat = upper(rcmCategory);
        if (cat) return cat;
        if (String(transportType || '').toUpperCase().includes('GTA')) return 'GTA';
        if (propertyType) return 'RENT';
        if (/courier|parcel/i.test(transportType || '')) return 'COURIER';
        return '';
    })();

    let bestActive = null;
    let bestDraft = null;

    for (const rule of rules) {
        if (!inEffectiveWindow(rule, txnDate)) continue;
        if (categoryHint && rule.category && categoryHint === 'RENT' && rule.category !== 'RENT' && rcmCategory) {
            // soft filter when category explicitly rent
            if (norm(rcmCategory).toUpperCase() === 'RENT' && rule.category !== 'RENT') continue;
        }
        const scored = scoreRule(rule, ctx);
        if (!scored) continue;
        if (rule.status === 'active') {
            if (!bestActive || scored.matched.length > bestActive.matched.length) bestActive = scored;
        } else if (!bestDraft || scored.matched.length > bestDraft.matched.length) {
            bestDraft = scored;
        }
    }

    const override = input.override || null;
    if (override?.finalTreatment) {
        const split = taxSplit(taxableValue, rate, gstType);
        return buildEmptyResult({
            treatment: override.finalTreatment,
            treatmentLabel: DISPLAY[override.finalTreatment] || override.finalTreatment,
            suggestedTreatment: bestActive?.rule?.decisionIfMatched || null,
            suggestedTreatmentLabel: bestActive
                ? DISPLAY[bestActive.rule.decisionIfMatched]
                : null,
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            suggestedGstRate: rate,
            ...split,
            rcmCategory,
            itcDefault,
            decisionReason: `Authorised override: ${override.reason || 'no reason'}. Preview only — no accounting.`,
            matchedRule: serializeMatchedRule(bestActive?.rule, bestActive?.rule?.source || 'mongodb'),
            overriddenValues: [
                {
                    field: 'treatment',
                    suggested: bestActive?.rule?.decisionIfMatched || null,
                    final: override.finalTreatment,
                    user: override.userId || override.user || null,
                    at: override.at || new Date().toISOString(),
                    reason: override.reason || '',
                },
            ],
            confidence: 'override',
            statusText: `${DISPLAY[override.finalTreatment] || override.finalTreatment} (Override — Preview Only)`,
            warnings: [PHASE_2A_BANNER, ...(ruleStoreWarning ? [ruleStoreWarning] : [])],
            ruleStoreWarning,
        });
    }

    if (bestActive) {
        const decision = bestActive.rule.decisionIfMatched;
        if (bestActive.missing.length) {
            return buildEmptyResult({
                treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
                treatmentLabel: DISPLAY.REVIEW_REQUIRED,
                suggestedTreatment: decision,
                suggestedTreatmentLabel: DISPLAY[decision],
                supplierGstStatus,
                supplierGstOption,
                placeOfSupply,
                taxableValue,
                suggestedGstRate: bestActive.rule.ratePercent ?? rate,
                rcmCategory: rcmCategory || bestActive.rule.category,
                itcDefault: itcDefault || 'Review Required',
                decisionReason: `Active rule ${bestActive.rule.ruleCode} partially matched; required answers missing.`,
                matchedRule: serializeMatchedRule(bestActive.rule, bestActive.rule.source || 'mongodb'),
                matchedConditions: bestActive.matched,
                missingConditions: bestActive.missing,
                missingInformation: bestActive.missing,
                statutoryReference: bestActive.rule.statutoryReference,
                effectiveDate: bestActive.rule.effectiveFrom,
                confidence: 'medium',
                statusText: 'Not Enough Information — Review Required',
                warnings: [...warnings, ...(ruleStoreWarning ? [ruleStoreWarning] : [])],
                ruleStoreWarning,
            });
        }
        const split = taxSplit(taxableValue, bestActive.rule.ratePercent ?? rate, gstType);
        const isRcm = decision === RCM_TREATMENTS.REVERSE_CHARGE;
        return buildEmptyResult({
            treatment: decision,
            treatmentLabel: DISPLAY[decision],
            suggestedTreatment: decision,
            suggestedTreatmentLabel: DISPLAY[decision],
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            suggestedGstRate: bestActive.rule.ratePercent ?? rate,
            ...split,
            rcmCategory: rcmCategory || bestActive.rule.category,
            itcDefault: isRcm ? (itcDefault || 'Review Required') : itcDefault,
            decisionReason: `Matched active rule ${bestActive.rule.ruleCode}: ${bestActive.rule.title || bestActive.rule.category}. ${PHASE_2A_BANNER}`,
            matchedRule: serializeMatchedRule(bestActive.rule, bestActive.rule.source || 'mongodb'),
            matchedConditions: bestActive.matched,
            statutoryReference: bestActive.rule.statutoryReference,
            effectiveDate: bestActive.rule.effectiveFrom,
            confidence: 'high',
            statusText: isRcm ? 'RCM Applicable — Preview Only' : DISPLAY[decision],
            warnings: [PHASE_2A_BANNER, ...warnings, ...(ruleStoreWarning ? [ruleStoreWarning] : [])],
            ruleStoreWarning,
        });
    }

    // Draft / inactive match — hint only
    if (bestDraft || ledgerRcmCandidate || ledgerTreatment === 'RCM_CANDIDATE') {
        if (!ctx.propertyType && (rcmCategory === 'RENT' || /rent/i.test(expenseLedger?.name || ''))) {
            missingInformation.push('propertyType');
        }
        if (
            (rcmCategory === 'GTA' || /transport|gta/i.test(expenseLedger?.name || ''))
            && !transportType
        ) {
            missingInformation.push('transportServiceType');
        }
        // Name may suggest only — never final
        if (/rent|transport|gta/i.test(expenseLedger?.name || '')) {
            warnings.push('Ledger name is a suggestion only — not a legal RCM decision.');
        }

        const draft = bestDraft;
        const suggested = draft?.rule?.decisionIfMatched || RCM_TREATMENTS.REVERSE_CHARGE;
        return buildEmptyResult({
            treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
            treatmentLabel: DISPLAY.REVIEW_REQUIRED,
            suggestedTreatment: suggested,
            suggestedTreatmentLabel: DISPLAY[suggested],
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            suggestedGstRate: draft?.rule?.ratePercent ?? rate,
            ...taxSplit(taxableValue, draft?.rule?.ratePercent ?? rate, gstType),
            rcmCategory: rcmCategory || draft?.rule?.category || null,
            itcDefault: itcDefault || 'Review Required',
            decisionReason: draft
                ? `Draft/inactive rule ${draft.rule.ruleCode} would apply if activated and approved. No active rule. ${PHASE_2A_BANNER}`
                : `Ledger is RCM candidate / treatment RCM_CANDIDATE but no active approved rule matches. ${PHASE_2A_BANNER}`,
            matchedDraftRule: draft
                ? {
                      ruleCode: draft.rule.ruleCode,
                      title: draft.rule.title,
                      status: draft.rule.status,
                      statutoryReference: draft.rule.statutoryReference,
                  }
                : null,
            matchedConditions: draft?.matched || [`ledgerRcmCandidate=${ledgerRcmCandidate}`],
            missingInformation,
            missingConditions: draft?.missing || missingInformation,
            statutoryReference: draft?.rule?.statutoryReference || '',
            effectiveDate: draft?.rule?.effectiveFrom || null,
            confidence: 'low',
            statusText: 'RCM Suggested — Review Required (Preview Only)',
            warnings: [
                PHASE_2A_BANNER,
                'Blank GSTIN alone did not trigger this result.',
                ...warnings,
            ],
        });
    }

    // Default: forward-looking GST on expense without RCM signals
    if (expenseLedger?.gstApplicable || rate > 0) {
        const split = taxSplit(taxableValue, rate, gstType);
        return buildEmptyResult({
            treatment: RCM_TREATMENTS.FORWARD_CHARGE,
            treatmentLabel: DISPLAY.FORWARD_CHARGE,
            suggestedTreatment: RCM_TREATMENTS.FORWARD_CHARGE,
            suggestedTreatmentLabel: DISPLAY.FORWARD_CHARGE,
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            suggestedGstRate: rate,
            ...split,
            rcmCategory,
            itcDefault: itcDefault || 'Eligible',
            decisionReason:
                'No RCM rule matched. Treating as Forward Charge candidate for preview. Blank GSTIN alone does not create RCM.',
            warnings: [
                ...warnings,
                ...(hasGstin(supplierGstin) ? [] : ['Blank GSTIN alone does not create RCM.']),
            ],
            confidence: 'medium',
            statusText: 'Forward Charge',
            matchedConditions: ['default=forward_charge_no_rcm_rule'],
        });
    }

    return buildEmptyResult({
        treatment: RCM_TREATMENTS.NOT_APPLICABLE,
        treatmentLabel: DISPLAY.NOT_APPLICABLE,
        supplierGstStatus,
        supplierGstOption,
        placeOfSupply,
        taxableValue,
        decisionReason: 'No GST/RCM applicability signals for this line.',
        warnings,
        confidence: 'medium',
        statusText: 'Not Applicable',
    });
}

export default {
    evaluateRcmDecision,
    ensureApprovedFixtureRules,
    RCM_TREATMENTS,
    PHASE_2A_BANNER,
};
