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
    mapTransportSupplierTypeToServiceType,
    mapTransportGstPaymentToOption,
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

function hasGstin(v) {
    const g = norm(v).replace(/\s/g, '');
    return g.length >= 15;
}

/**
 * Resolve supplier for RCM evaluate.
 * A) explicit supplierId
 * B) companyId + active + ledgerId (never name-only)
 * C) none → not found
 * D) multiple → ambiguous (Review Required)
 */
export async function resolveSupplierForRcmEvaluate(input = {}) {
    const warnings = [];
    if (input.supplierId) {
        const supplier = await Supplier.findById(input.supplierId).lean();
        if (!supplier || supplier.isDeleted) {
            return {
                supplier: null,
                resolution: 'explicit_not_found',
                ambiguous: false,
                matchCount: 0,
                warnings: ['Explicit supplierId not found. Continuing with party-ledger facts.'],
            };
        }
        return {
            supplier,
            resolution: 'explicit',
            ambiguous: false,
            matchCount: 1,
            warnings,
        };
    }

    const ledgerId = input.partyLedgerId || null;
    if (!ledgerId) {
        return {
            supplier: null,
            resolution: 'no_party_ledger',
            ambiguous: false,
            matchCount: 0,
            warnings: ['Supplier Profile was not found (no party ledger / supplierId).'],
        };
    }

    const companyId = input.companyId || null;
    const base = {
        ledgerId,
        isDeleted: { $ne: true },
        isActive: { $ne: false },
    };
    let matches = await Supplier.find(base).lean();
    if (companyId && matches.length > 1) {
        const scoped = matches.filter(
            (s) => !s.companyId || String(s.companyId) === String(companyId),
        );
        if (scoped.length) matches = scoped;
    } else if (companyId && matches.length === 1) {
        const only = matches[0];
        if (only.companyId && String(only.companyId) !== String(companyId)) {
            matches = [];
        }
    }

    if (matches.length === 0) {
        return {
            supplier: null,
            resolution: 'not_found',
            ambiguous: false,
            matchCount: 0,
            warnings: ['Supplier Profile was not found for this creditor ledger. Using party-ledger facts only.'],
        };
    }
    if (matches.length > 1) {
        return {
            supplier: null,
            resolution: 'ambiguous',
            ambiguous: true,
            matchCount: matches.length,
            warnings: [
                `Multiple suppliers (${matches.length}) link to this ledger. Select the correct supplier — do not auto-pick.`,
            ],
        };
    }
    return {
        supplier: matches[0],
        resolution: 'ledger',
        ambiguous: false,
        matchCount: 1,
        warnings,
    };
}

function buildRecipientCompanyFacts(company) {
    const gstin = norm(company?.gstNumber);
    const registered = hasGstin(gstin);
    return {
        companyName: norm(company?.companyName || company?.name || ''),
        gstRegistrationStatus: registered ? 'Registered (derived from GSTIN)' : 'Unregistered / Not derived',
        gstRegistrationStatusDerived: true,
        gstin: gstin || '',
        state: norm(company?.state),
        recipientRegistered: registered,
    };
}

/**
 * Apply supplier-master defaults only where voucher input is empty.
 * Defaults never force Reverse Charge from "not charging GST".
 */
export function applySupplierRcmDefaults(input = {}, supplier) {
    if (!supplier) {
        return { ...input, _supplierDefaultsApplied: [] };
    }
    const applied = [];
    const out = { ...input };

    if (!norm(out.supplierGstStatus) && norm(supplier.gstRegistrationStatus)) {
        out.supplierGstStatus = supplier.gstRegistrationStatus;
        applied.push('supplierGstStatus');
    }
    if (!norm(out.supplierGstin) && norm(supplier.gstNumber)) {
        out.supplierGstin = supplier.gstNumber;
        applied.push('supplierGstin');
    }
    if (!norm(out.placeOfSupply) && norm(supplier.defaultPlaceOfSupply || supplier.state)) {
        out.placeOfSupply = supplier.defaultPlaceOfSupply || supplier.state;
        applied.push('placeOfSupply');
    }
    if (!norm(out.supplierGstOption)) {
        const fromCharges = norm(supplier.supplierChargesGst);
        const fromTransportPay = mapTransportGstPaymentToOption(supplier.transportGstPaymentOption);
        if (fromCharges && fromCharges !== 'Not Applicable') {
            out.supplierGstOption = fromCharges === 'Reverse Charge' ? 'Reverse Charge' : fromCharges;
            applied.push('supplierGstOption');
        } else if (fromTransportPay) {
            out.supplierGstOption = fromTransportPay;
            applied.push('supplierGstOption');
        }
    }
    if (!norm(out.propertyType) && norm(supplier.defaultPropertyType)
        && supplier.defaultPropertyType !== 'Transaction-wise') {
        const explicitCat = Object.prototype.hasOwnProperty.call(input, 'rcmCategory')
            ? norm(input.rcmCategory).toUpperCase()
            : '';
        // Do not force Rent property defaults onto non-RENT voucher categories
        if (!explicitCat || explicitCat === 'RENT' || explicitCat === '') {
            out.propertyType = supplier.defaultPropertyType;
            applied.push('propertyType');
        }
    }
    if (!norm(out.rcmCategory)) {
        const cats = Array.isArray(supplier.defaultRcmCategories) ? supplier.defaultRcmCategories : [];
        const transportCat = norm(supplier.defaultTransportRcmCategory);
        if (cats.length === 1) {
            out.rcmCategory = cats[0];
            applied.push('rcmCategory');
        } else if (transportCat && transportCat !== 'None') {
            out.rcmCategory = transportCat;
            applied.push('rcmCategory');
        }
    }
    if (!norm(out.transportServiceType) && norm(supplier.transportSupplierType)) {
        const mapped = mapTransportSupplierTypeToServiceType(supplier.transportSupplierType);
        if (mapped) {
            out.transportServiceType = mapped;
            applied.push('transportServiceType');
        }
    }
    if (
        (out.consignmentNoteAvailable === undefined || out.consignmentNoteAvailable === '' || out.consignmentNoteAvailable === null)
        && norm(supplier.consignmentNoteNormallyIssued)
        && supplier.consignmentNoteNormallyIssued !== 'Transaction-wise'
    ) {
        out.consignmentNoteAvailable = supplier.consignmentNoteNormallyIssued === 'Yes';
        applied.push('consignmentNoteAvailable');
    }

    out._supplierDefaultsApplied = applied;
    out._defaultRcmTreatment = norm(supplier.defaultRcmTreatment) || '';
    return out;
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
/**
 * @param {object} input
 * @param {object} [options]
 * @param {boolean} [options.includeDraftRules] — evaluate draft/inactive for preview hints only
 */
export async function evaluateRcmDecision(input = {}, options = {}) {
    const includeDraft = options.includeDraftRules === true;
    const txnDate = parseDate(input.transactionDate);
    const companyId = input.companyId || null;

    const [company, expenseLedger, partyLedger] = await Promise.all([
        companyId ? Company.findById(companyId).lean() : null,
        input.expenseLedgerId
            ? AccountLedger.findById(input.expenseLedgerId).lean()
            : input.ledgerId
              ? AccountLedger.findById(input.ledgerId).lean()
              : null,
        input.partyLedgerId ? AccountLedger.findById(input.partyLedgerId).lean() : null,
    ]);

    const recipientCompany = buildRecipientCompanyFacts(company);
    const resolved = await resolveSupplierForRcmEvaluate(input);
    const supplier = resolved.supplier;
    const profileWarnings = [...(resolved.warnings || [])];

    const withMeta = (result) => ({
        ...result,
        recipientCompany,
        supplierProfile: {
            resolution: resolved.resolution,
            ambiguous: !!resolved.ambiguous,
            matchCount: resolved.matchCount || 0,
            supplierId: supplier?._id || null,
            supplierName: supplier?.supplierName || '',
            defaultRcmTreatment: supplier?.defaultRcmTreatment || '',
            defaultRcmCategories: supplier?.defaultRcmCategories || [],
            defaultsApplied: [],
            profileFound: !!supplier,
        },
    });

    if (resolved.ambiguous) {
        return withMeta(buildEmptyResult({
            treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
            treatmentLabel: DISPLAY.REVIEW_REQUIRED,
            decisionReason:
                'Multiple suppliers link to this creditor ledger. Select the correct supplier before RCM evaluation. Name-only matching is never used.',
            missingInformation: ['supplierId'],
            warnings: profileWarnings,
            confidence: 'low',
            statusText: 'Review Required — ambiguous supplier',
        }));
    }

    // Supplier defaults prefill empty voucher fields only; transaction answers already on input win.
    const mergedInput = applySupplierRcmDefaults(input, supplier);
    const defaultsApplied = mergedInput._supplierDefaultsApplied || [];

    const withMetaApplied = (result) => {
        const base = withMeta(result);
        return {
            ...base,
            supplierProfile: {
                ...base.supplierProfile,
                defaultRcmTreatment: supplier?.defaultRcmTreatment || mergedInput._defaultRcmTreatment || '',
                defaultsApplied,
            },
        };
    };

    // Canonical enum normalisation — reject unsupported values
    const propN = normalizePropertyType(mergedInput.propertyType);
    if (propN.error) throw new ApiError(400, propN.error);
    const catN = normalizeRcmCategory(mergedInput.rcmCategory || mergedInput.rcmCategoryHint);
    if (catN.error) throw new ApiError(400, catN.error);
    const taxOptN = normalizeSupplierTaxOption(
        mergedInput.supplierGstOption || mergedInput.supplierTaxOption,
    );
    if (taxOptN.error) throw new ApiError(400, taxOptN.error);
    const statusN = normalizeSupplierGstStatus(mergedInput.supplierGstStatus);
    if (statusN.error) throw new ApiError(400, statusN.error);
    const transportN = normalizeTransportServiceType(mergedInput.transportServiceType, {
        consignmentNoteAvailable: mergedInput.consignmentNoteAvailable,
    });
    if (transportN.error) throw new ApiError(400, transportN.error);

    const supplierGstin = norm(
        mergedInput.supplierGstin || supplier?.gstNumber || partyLedger?.gstin || '',
    );
    const supplierGstStatus =
        statusN.value
        || normalizeSupplierGstStatus(mapSupplierRegStatus(supplier, partyLedger)).value
        || mapSupplierRegStatus(supplier, partyLedger);
    const supplierGstOption = taxOptN.value || norm(supplier?.supplierChargesGst) || '';
    const placeOfSupply =
        norm(mergedInput.placeOfSupply)
        || norm(supplier?.defaultPlaceOfSupply)
        || norm(partyLedger?.state)
        || norm(supplier?.state)
        || '';
    const hsnSac =
        norm(mergedInput.hsnSac) || norm(expenseLedger?.defaultHsnSac) || norm(expenseLedger?.hsnCode) || '';
    const taxableValue = Number(mergedInput.taxableValue) || 0;
    const gstType = mergedInput.gstType || 'CGST / SGST';
    const rate =
        mergedInput.suggestedGstRate != null
            ? Number(mergedInput.suggestedGstRate)
            : Number(expenseLedger?.gstRate) || null;

    const ledgerTreatment = norm(expenseLedger?.gstTreatmentDefault) || 'TRANSACTION_WISE';
    const ledgerRcmCandidate = !!expenseLedger?.rcmCandidate;
    let rcmCategory = catN.value || norm(expenseLedger?.defaultRcmCategory) || '';
    const itcDefault = norm(expenseLedger?.defaultItcEligibility) || null;
    const propertyTypeRaw = propN.value || '';
    const propertyType = propertyTypeRaw === 'Transaction-wise' ? '' : propertyTypeRaw;
    let transportServiceType = transportN.value || '';

    if (!rcmCategory && propertyType) rcmCategory = 'RENT';
    if (!rcmCategory && /gta/i.test(transportServiceType)) rcmCategory = 'GTA';
    if (!rcmCategory && /courier/i.test(transportServiceType)) rcmCategory = 'COURIER';
    if (/courier/i.test(transportServiceType) && rcmCategory === 'GTA') rcmCategory = 'COURIER';
    if (/local transport/i.test(transportServiceType) && rcmCategory === 'GTA') rcmCategory = 'OTHER';

    const ctx = {
        supplierGstin,
        supplierGstStatus,
        supplierGstOption,
        placeOfSupply,
        hsnSac,
        propertyType,
        transportServiceType,
        consignmentNoteAvailable: mergedInput.consignmentNoteAvailable,
        supplierGstCharged: mergedInput.supplierGstCharged,
        rcmCategory,
        ledgerRcmCandidate,
        recipientRegistered: recipientCompany.recipientRegistered,
        companyState: recipientCompany.state,
    };

    const warnings = [...profileWarnings];
    const missingInformation = [];
    if (propertyTypeRaw === 'Transaction-wise') {
        missingInformation.push('propertyType');
        warnings.push('Property type is Transaction-wise — select Commercial / Residential / Mixed / Other on the voucher.');
    }
    if (!supplier && resolved.resolution === 'not_found') {
        warnings.push('Supplier Profile was not found.');
    }
    if (defaultsApplied.length) {
        warnings.push(
            `Supplier defaults prefilled (suggestions only): ${defaultsApplied.join(', ')}. Voucher answers override for evaluation.`,
        );
    }

    if (ledgerTreatment === 'NON_GST' || (expenseLedger && expenseLedger.gstApplicable === false && !ledgerRcmCandidate)) {
        return withMetaApplied(buildEmptyResult({
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
            warnings,
        }));
    }

    if (
        ledgerTreatment === 'EXEMPT'
        || ledgerTreatment === 'NIL_RATED'
        || norm(mergedInput.ledgerGstTreatment) === 'EXEMPT'
    ) {
        return withMetaApplied(buildEmptyResult({
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
            decisionReason: `Ledger default treatment is ${ledgerTreatment === 'TRANSACTION_WISE' ? mergedInput.ledgerGstTreatment || ledgerTreatment : ledgerTreatment}.`,
            confidence: 'high',
            statusText: 'Exempt',
            matchedConditions: [`ledgerTreatment=${ledgerTreatment}`],
            warnings,
        }));
    }

    // Explicit "GST charged on this bill?" answers override document GST heuristics.
    // Voucher line GST rates alone must NOT force Forward Charge under RCM (e.g. Rent).
    const chargedAnswer = mergedInput.supplierGstCharged;
    const chargedExplicitNo = chargedAnswer === false || chargedAnswer === 'NO';
    const chargedExplicitYes = chargedAnswer === true || chargedAnswer === 'YES';
    const supplierChargedGst = chargedExplicitNo
        ? false
        : (
            chargedExplicitYes
            || (Number(mergedInput.documentGstAmount) || 0) > 0
            || supplierGstOption === 'Forward Charge'
        );

    // Authorised override wins over forward-charge heuristics (reason required by UI).
    const earlyOverride = mergedInput.override || null;
    if (earlyOverride?.finalTreatment) {
        const split = taxSplit(taxableValue, rate, gstType);
        return withMetaApplied(buildEmptyResult({
            treatment: earlyOverride.finalTreatment,
            treatmentLabel: DISPLAY[earlyOverride.finalTreatment] || earlyOverride.finalTreatment,
            suggestedTreatment: null,
            suggestedTreatmentLabel: null,
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            suggestedGstRate: rate,
            ...split,
            rcmCategory,
            itcDefault,
            decisionReason: `Authorised override: ${earlyOverride.reason || 'no reason'}. Preview only — no accounting.`,
            overriddenValues: [
                {
                    field: 'treatment',
                    suggested: null,
                    final: earlyOverride.finalTreatment,
                    user: earlyOverride.userId || earlyOverride.user || null,
                    at: earlyOverride.at || new Date().toISOString(),
                    reason: earlyOverride.reason || '',
                },
            ],
            confidence: 'override',
            statusText: `${DISPLAY[earlyOverride.finalTreatment] || earlyOverride.finalTreatment} (Override — Preview Only)`,
            warnings: [PHASE_2A_BANNER, ...warnings],
        }));
    }

    if (supplierChargedGst && (hasGstin(supplierGstin) || /registered/i.test(supplierGstStatus))) {
        const split = taxSplit(taxableValue, rate, gstType);
        return withMetaApplied(buildEmptyResult({
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
                    ? [...warnings, 'Ledger is RCM candidate but forward-charge invoice takes priority.']
                    : warnings,
        }));
    }

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
            return withMetaApplied(buildEmptyResult({
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
            }));
        }
    }

    const transportType = ctx.transportServiceType;
    if (/courier/i.test(transportType) || /courier/i.test(rcmCategory)) {
        warnings.push('Courier / non-GTA transport is evaluated separately from GTA RCM.');
    }
    if (/local transport/i.test(transportType)) {
        warnings.push('Local transporter without consignment note is not automatically GTA RCM.');
    }
    if (propertyType === 'Mixed') {
        warnings.push('Mixed property type requires an approved rule or Review Required — never mapped silently to Commercial/Other.');
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
        const explicitCat = upper(rcmCategory);
        if (
            explicitCat
            && rule.category
            && explicitCat !== upper(rule.category)
            && explicitCat !== 'GENERAL'
        ) {
            // Explicit voucher category must not silently match another category's rule
            continue;
        }
        if (categoryHint && rule.category && categoryHint === 'RENT' && rule.category !== 'RENT' && rcmCategory) {
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

    if (propertyType === 'Mixed') {
        const mixedOk = bestActive?.matched?.some((m) => /propertyType=Mixed/i.test(m));
        if (!mixedOk) {
            return withMetaApplied(buildEmptyResult({
                treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
                treatmentLabel: DISPLAY.REVIEW_REQUIRED,
                suggestedTreatment: bestActive?.rule?.decisionIfMatched || null,
                suggestedTreatmentLabel: bestActive
                    ? DISPLAY[bestActive.rule.decisionIfMatched]
                    : null,
                supplierGstStatus,
                supplierGstOption,
                placeOfSupply,
                taxableValue,
                rcmCategory: rcmCategory || 'RENT',
                itcDefault: itcDefault || 'Review Required',
                decisionReason:
                    'Property type Mixed requires Review Required unless an approved active rule explicitly covers Mixed. Commercial/Residential/Other rules are not applied silently.',
                missingInformation: [...missingInformation],
                warnings: [...warnings, ...(ruleStoreWarning ? [ruleStoreWarning] : [])],
                confidence: 'low',
                statusText: 'Review Required — Mixed property',
                ruleStoreWarning,
            }));
        }
    }

    if (propertyTypeRaw === 'Transaction-wise' && !propertyType) {
        return withMetaApplied(buildEmptyResult({
            treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
            treatmentLabel: DISPLAY.REVIEW_REQUIRED,
            supplierGstStatus,
            supplierGstOption,
            placeOfSupply,
            taxableValue,
            rcmCategory,
            decisionReason: 'Select an actual property type on the voucher (Commercial / Residential / Mixed / Other).',
            missingInformation: ['propertyType', ...missingInformation],
            warnings,
            confidence: 'low',
            statusText: 'Review Required — property type',
        }));
    }

    const override = mergedInput.override || null;
    if (override?.finalTreatment) {
        const split = taxSplit(taxableValue, rate, gstType);
        return withMetaApplied(buildEmptyResult({
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
            warnings: [PHASE_2A_BANNER, ...warnings, ...(ruleStoreWarning ? [ruleStoreWarning] : [])],
            ruleStoreWarning,
        }));
    }

    if (bestActive) {
        const decision = bestActive.rule.decisionIfMatched;
        if (bestActive.missing.length) {
            return withMetaApplied(buildEmptyResult({
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
                missingInformation: [...bestActive.missing, ...missingInformation],
                statutoryReference: bestActive.rule.statutoryReference,
                effectiveDate: bestActive.rule.effectiveFrom,
                confidence: 'medium',
                statusText: 'Not Enough Information — Review Required',
                warnings: [...warnings, ...(ruleStoreWarning ? [ruleStoreWarning] : [])],
                ruleStoreWarning,
            }));
        }
        const split = taxSplit(taxableValue, bestActive.rule.ratePercent ?? rate, gstType);
        const isRcm = decision === RCM_TREATMENTS.REVERSE_CHARGE;
        return withMetaApplied(buildEmptyResult({
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
        }));
    }

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
        if (/rent|transport|gta/i.test(expenseLedger?.name || '')) {
            warnings.push('Ledger name is a suggestion only — not a legal RCM decision.');
        }

        const draft = bestDraft;
        const suggested = draft?.rule?.decisionIfMatched || RCM_TREATMENTS.REVERSE_CHARGE;
        return withMetaApplied(buildEmptyResult({
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
        }));
    }

    if (expenseLedger?.gstApplicable || rate > 0) {
        // RCM signals present + GST not charged on bill → never silently default to Forward Charge
        // (line GST rates alone are for liability preview, not supplier-charged GST).
        if (hasRcmSignals && chargedExplicitNo) {
            const split = taxSplit(taxableValue, rate, gstType);
            return withMetaApplied(buildEmptyResult({
                treatment: RCM_TREATMENTS.REVIEW_REQUIRED,
                treatmentLabel: DISPLAY.REVIEW_REQUIRED,
                suggestedTreatment: RCM_TREATMENTS.REVERSE_CHARGE,
                suggestedTreatmentLabel: DISPLAY.REVERSE_CHARGE,
                supplierGstStatus,
                supplierGstOption,
                placeOfSupply,
                taxableValue,
                suggestedGstRate: rate,
                ...split,
                rcmCategory,
                itcDefault: itcDefault || 'Review Required',
                decisionReason:
                    'RCM signals present and GST is not charged on this bill, but no active RCM rule fully matched. Review required — do not treat as Forward Charge.',
                warnings: [
                    PHASE_2A_BANNER,
                    ...warnings,
                    'Complete property/category answers or use authorised override with reason.',
                ],
                confidence: 'medium',
                statusText: 'Review Required',
                missingInformation,
                matchedConditions: ['default=review_rcm_signals_no_rule'],
            }));
        }
        const split = taxSplit(taxableValue, rate, gstType);
        return withMetaApplied(buildEmptyResult({
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
        }));
    }

    return withMetaApplied(buildEmptyResult({
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
    }));
}


export default {
    evaluateRcmDecision,
    ensureApprovedFixtureRules,
    resolveSupplierForRcmEvaluate,
    applySupplierRcmDefaults,
    RCM_TREATMENTS,
    PHASE_2A_BANNER,
};
