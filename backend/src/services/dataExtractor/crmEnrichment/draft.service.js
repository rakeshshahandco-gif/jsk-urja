import mongoose from 'mongoose';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { ensureModelIndexes } from '../../../utils/ensureModelIndexes.js';
import { AiCrmEnrichmentTransaction } from '../../../models/aiCrmEnrichmentTransaction.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiSimilarCompanyResult } from '../../../models/aiSimilarCompanyResult.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { evaluateEligibility } from './eligibility.service.js';
import { matchAgainstCrm } from './matching.service.js';
import {
    buildProposedFieldsFromSource,
    buildFieldComparisons,
    applyFieldDecisions,
    conflictsFromComparisons,
} from './comparison.service.js';
import {
    loadCrmEntity,
    createCrmLeadFromDraft,
    applyCrmEnrichment,
    findExistingLeadByExtractorRef,
    buildPatchFromDecisions,
    engineMeta,
} from './crmAdapter.service.js';
import { assertNoSecrets } from './normalize.util.js';
import {
    CRM_CREATE_LEAD_PERM,
    CRM_EDIT_LEAD_PERM,
    CRM_EDIT_CUSTOMER_PERM,
    CRM_EDIT_SUPPLIER_PERM,
} from './constants.js';

async function ensureCrmEnrichmentStores() {
    await ensureModelIndexes(AiCrmEnrichmentDraft);
    await ensureModelIndexes(AiCrmEnrichmentTransaction);
}

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function slim(doc) {
    if (!doc) return null;
    return {
        status: doc.status,
        eligibilityStatus: doc.eligibilityStatus,
        matchStatus: doc.matchStatus,
        draftActionType: doc.draftActionType,
        companyName: doc.companyName,
        locked: !!doc.locked,
        convertedCrmLeadId: doc.convertedCrmLeadId,
    };
}

function historyEntry(action, userId, previous, next, reason = '', targetEntity = '', result = '') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous: slim(previous),
        next: slim(next),
        reason: String(reason || '').slice(0, 2000),
        targetEntity,
        result,
        sourceType: 'system',
    };
}

function requirePerm(user, key) {
    if (!checkUserPermission(user, key)) throw new ApiError(403, `Missing permission: ${key}`);
}

async function loadIntelligence(companyId, extractedLeadId, similarCompanyResultId) {
    let extractedLead = null;
    let similarResult = null;
    if (extractedLeadId) {
        extractedLead = await ExtractedLead.findOne({ _id: extractedLeadId, companyId }).lean();
        if (!extractedLead) throw new ApiError(404, 'Extracted lead not found');
    }
    if (similarCompanyResultId) {
        similarResult = await AiSimilarCompanyResult.findOne({ _id: similarCompanyResultId, companyId, isDeleted: { $ne: true } }).lean();
        if (!similarResult) throw new ApiError(404, 'Similar company result not found');
        if (!extractedLead && similarResult.candidateExtractedLeadId) {
            extractedLead = await ExtractedLead.findOne({ _id: similarResult.candidateExtractedLeadId, companyId }).lean();
        }
    }
    const leadId = extractedLead?._id;
    const [recommendation, contact, profile, score, classification] = leadId
        ? await Promise.all([
            AiProductRecommendation.findOne({ companyId, extractedLeadId: leadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiContactIntelligence.findOne({ companyId, extractedLeadId: leadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiCompanyIntelligenceProfile.findOne({ companyId, extractedLeadId: leadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiLeadScore.findOne({ companyId, extractedLeadId: leadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiIndustryClassification.findOne({ companyId, extractedLeadId: leadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        ])
        : [null, null, null, null, null];
    return { extractedLead, similarResult, recommendation, contact, profile, score, classification };
}

function recordKeyOf({ extractedLeadId, similarCompanyResultId, adhocKey }) {
    if (extractedLeadId) return `lead:${extractedLeadId}`;
    if (similarCompanyResultId) return `similar:${similarCompanyResultId}`;
    if (adhocKey) return `adhoc:${adhocKey}`;
    return '';
}

export async function listDrafts(companyId, query = {}) {
    await ensureCrmEnrichmentStores();
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.eligibilityStatus) q.eligibilityStatus = query.eligibilityStatus;
    if (query.matchStatus) q.matchStatus = query.matchStatus;
    if (query.draftActionType) q.draftActionType = query.draftActionType;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiCrmEnrichmentDraft.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiCrmEnrichmentDraft.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getDraft(companyId, id) {
    await ensureCrmEnrichmentStores();
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'CRM enrichment draft not found');
    return doc;
}

export async function getDraftHistory(companyId, id) {
    await ensureCrmEnrichmentStores();
    const doc = await getDraft(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}

export async function prepareDraft(companyId, userId, payload = {}) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    const intel = await loadIntelligence(companyId, payload.extractedLeadId, payload.similarCompanyResultId);
    const eligibility = evaluateEligibility(intel);
    if (['NOT_APPROVED', 'BLOCKED', 'INVALID', 'ALREADY_CONVERTED'].includes(eligibility.eligibilityStatus)) {
        throw new ApiError(400, `Record not eligible: ${eligibility.eligibilityStatus}`);
    }

    const source = intel.extractedLead || {
        companyName: intel.similarResult?.candidateCompanyName || payload.companyName || '',
        website: '', email: '', phone: '', city: '',
    };

    let forceSeparate = false;
    if (intel.similarResult && ['RELATED_COMPANY_REVIEW', 'POSSIBLE_BRANCH_REVIEW'].includes(intel.similarResult.status)) {
        forceSeparate = true;
    }

    const match = forceSeparate
        ? { matchStatus: 'MANUAL_REVIEW_REQUIRED', matchScore: 0, matchEvidence: [{ signal: 'related_or_branch_not_auto_linked' }], matchCandidates: [], matchedCrmEntityType: 'NONE', matchedCrmEntityId: null }
        : await matchAgainstCrm(companyId, source);

    const proposed = buildProposedFieldsFromSource(source, {
        contact: intel.contact, classification: intel.classification, score: intel.score,
        recommendation: intel.recommendation, profile: intel.profile,
    });
    assertNoSecrets(proposed);

    let crmEntity = null;
    let actionType = 'CREATE_LEAD_DRAFT';
    if (forceSeparate) actionType = 'KEEP_SEPARATE';
    else if (match.matchedCrmEntityId && ['EXACT_MATCH', 'STRONG_MATCH'].includes(match.matchStatus)) {
        crmEntity = await loadCrmEntity(companyId, match.matchedCrmEntityType, match.matchedCrmEntityId);
        actionType = match.matchedCrmEntityType === 'LEAD' ? 'ENRICH_EXISTING_LEAD'
            : match.matchedCrmEntityType === 'CUSTOMER' ? 'ENRICH_EXISTING_CUSTOMER' : 'ENRICH_EXISTING_SUPPLIER';
    } else if (['MULTIPLE_MATCHES', 'POSSIBLE_MATCH', 'MANUAL_REVIEW_REQUIRED', 'CONFLICTING_MATCH'].includes(match.matchStatus)) {
        actionType = 'MANUAL_REVIEW_REQUIRED';
    }

    const comparisons = buildFieldComparisons({
        entityType: match.matchedCrmEntityType === 'NONE' ? 'LEAD' : match.matchedCrmEntityType,
        crmEntity, proposed,
        sourceMeta: { sourceUrl: source.sourceUrl || source.website || '', confidence: intel.score?.confidence || 60 },
    });
    const conflicts = conflictsFromComparisons(comparisons);

    let status = 'FIELD_REVIEW_REQUIRED';
    if (['LOW_CONFIDENCE_REVIEW', 'DUPLICATE_REVIEW_REQUIRED', 'CONFLICT_REVIEW_REQUIRED'].includes(eligibility.eligibilityStatus)
        || actionType === 'MANUAL_REVIEW_REQUIRED' || actionType === 'KEEP_SEPARATE') {
        status = 'MATCH_REVIEW_REQUIRED';
    }

    const key = recordKeyOf({
        extractedLeadId: intel.extractedLead?._id,
        similarCompanyResultId: intel.similarResult?._id,
        adhocKey: payload.adhocKey,
    }) || `adhoc:${new mongoose.Types.ObjectId()}`;
    const idempotencyKey = String(payload.idempotencyKey || `${key}:prepare:${actionType}`).trim();
    if (idempotencyKey) {
        const existingIdem = await AiCrmEnrichmentDraft.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existingIdem && !payload.force) {
            if (['CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD'].includes(existingIdem.status)) {
                return { skipped: true, reason: 'already_converted', draft: existingIdem.toObject() };
            }
            if (existingIdem.locked) return { skipped: true, reason: 'locked', draft: existingIdem.toObject() };
        }
    }

    const docPayload = {
        companyId,
        financialYear: payload.financialYear || intel.extractedLead?.financialYear || '',
        recordKey: key, idempotencyKey,
        extractedLeadId: intel.extractedLead?._id || null,
        similarCompanyResultId: intel.similarResult?._id || null,
        companyName: source.companyName || '',
        eligibilityStatus: eligibility.eligibilityStatus,
        eligibilityReasons: eligibility.reasons,
        approvedIntelligenceRefs: eligibility.approvedIntelligenceRefs,
        matchedCrmEntityType: match.matchedCrmEntityType || 'NONE',
        matchedCrmEntityId: match.matchedCrmEntityId || null,
        matchScore: match.matchScore || 0,
        matchStatus: match.matchStatus,
        matchEvidence: match.matchEvidence || [],
        matchCandidates: match.matchCandidates || [],
        draftActionType: actionType, status,
        proposedCrmFields: proposed, fieldComparisons: comparisons, conflicts,
        sourceReferences: [
            { type: 'extracted_lead', id: intel.extractedLead?._id, sourceUrl: source.sourceUrl || source.website },
            { type: 'similar_company', id: intel.similarResult?._id },
        ].filter((x) => x.id),
        leadScoreSnapshot: intel.score ? { finalScore: intel.score.finalScore, priority: intel.score.priority } : null,
        productRecommendationSnapshot: intel.recommendation?.primaryRecommendation || null,
        contactSnapshot: intel.contact?.primaryContact || null,
        companyProfileSnapshot: intel.profile ? { status: intel.profile.status, confidence: intel.profile.confidence } : null,
        updatedBy: userId, ...engineMeta(),
    };

    let existing = await AiCrmEnrichmentDraft.findOne({ companyId, recordKey: key, isDeleted: { $ne: true } });
    if (existing?.locked && !payload.force) return { skipped: true, reason: 'locked', draft: existing.toObject() };
    if (!existing) {
        const created = await AiCrmEnrichmentDraft.create({
            ...docPayload, createdBy: userId,
            history: [historyEntry('prepared', userId, null, docPayload, 'Prepared CRM enrichment draft')],
        });
        return { skipped: false, draft: created.toObject() };
    }
    const previous = existing.toObject();
    Object.assign(existing, docPayload);
    existing.history = [...(existing.history || []), historyEntry('reprepared', userId, previous, docPayload, payload.reason || 'Re-prepared')].slice(-100);
    await existing.save();
    return { skipped: false, draft: existing.toObject() };
}

export async function setFieldDecisions(companyId, userId, id, payload = {}) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    const previous = doc.toObject();
    doc.fieldComparisons = applyFieldDecisions(doc.fieldComparisons, payload.decisions || {});
    doc.conflicts = conflictsFromComparisons(doc.fieldComparisons);
    if (payload.matchedCrmEntityType) doc.matchedCrmEntityType = payload.matchedCrmEntityType;
    if (payload.matchedCrmEntityId !== undefined) doc.matchedCrmEntityId = payload.matchedCrmEntityId || null;
    if (payload.draftActionType) doc.draftActionType = payload.draftActionType;
    doc.status = 'FIELD_REVIEW_REQUIRED';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('field_decisions', userId, previous, doc.toObject(), payload.reason || 'Field decisions updated', doc.matchedCrmEntityType)].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function previewDraft(companyId, userId, id, payload = {}) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    if (['NOT_APPROVED', 'BLOCKED'].includes(doc.eligibilityStatus)) throw new ApiError(400, 'Not eligible');
    const previous = doc.toObject();
    const { patch, applied, rejected, alternates } = buildPatchFromDecisions({
        entityType: doc.draftActionType === 'CREATE_LEAD_DRAFT' ? 'LEAD' : doc.matchedCrmEntityType,
        comparisons: doc.fieldComparisons, proposed: doc.proposedCrmFields,
    });
    const preview = {
        actionType: doc.draftActionType,
        matchedCrmEntityType: doc.matchedCrmEntityType,
        matchedCrmEntityId: doc.matchedCrmEntityId,
        patch, applied, rejected, alternates,
        pendingFields: (doc.fieldComparisons || []).filter((c) => c.userDecision === 'PENDING' && !['SAME_VALUE', 'FORMAT_ONLY'].includes(c.changeType)).map((c) => c.fieldKey),
        requiresFinalApproval: true,
        noAutoCustomerCreate: true, noAutoSupplierCreate: true, noAutoTaskCreate: true, noAutoCommunications: true,
    };
    assertNoSecrets(preview);
    doc.previewPayload = preview;
    doc.status = preview.pendingFields.length ? 'FIELD_REVIEW_REQUIRED' : 'READY_FOR_APPROVAL';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('preview', userId, previous, doc.toObject(), 'Preview generated')].slice(-100);
    await doc.save();
    return { draft: doc.toObject(), preview };
}

export async function finalApproveDraft(companyId, userId, id, payload = {}) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    if (doc.status !== 'READY_FOR_APPROVAL' && payload.forceApproval !== true) {
        throw new ApiError(400, 'Draft must be previewed and READY_FOR_APPROVAL before final approval');
    }
    const previous = doc.toObject();
    doc.status = 'APPROVED';
    doc.manuallyApproved = true;
    doc.finalApprovalAt = new Date();
    doc.finalApprovalBy = userId;
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('final_approve', userId, previous, doc.toObject(), payload.reason || 'Final approval')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function createLeadFromDraft(companyId, userId, id, payload = {}, user = null) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.crm_enrichment.create_lead');
    requirePerm(user, CRM_CREATE_LEAD_PERM);
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    if (['NOT_APPROVED', 'BLOCKED'].includes(doc.eligibilityStatus)) throw new ApiError(400, 'Not eligible');
    if (doc.draftActionType === 'KEEP_SEPARATE') throw new ApiError(400, 'Marked keep separate — will not create/link');
    if (doc.draftActionType !== 'CREATE_LEAD_DRAFT' && doc.status !== 'CONVERTED_TO_LEAD') {
        throw new ApiError(400, 'Draft action is not CREATE_LEAD_DRAFT');
    }

    // Idempotency before approval gate so repeat requests do not fail after conversion
    if (doc.convertedCrmLeadId) {
        const existing = await loadCrmEntity(companyId, 'LEAD', doc.convertedCrmLeadId);
        return { idempotent: true, lead: existing, draft: doc.toObject() };
    }
    const byRef = await findExistingLeadByExtractorRef(companyId, doc.extractedLeadId);
    if (byRef) {
        doc.convertedCrmLeadId = byRef._id;
        doc.status = 'CONVERTED_TO_LEAD';
        doc.conversionStatus = 'idempotent_existing';
        await doc.save();
        return { idempotent: true, lead: byRef, draft: doc.toObject() };
    }
    if (doc.status !== 'APPROVED') throw new ApiError(400, 'Final approval required before Lead creation');

    const previous = doc.toObject();
    doc.status = 'CONVERSION_IN_PROGRESS';
    await doc.save();
    try {
        const lead = await createCrmLeadFromDraft(companyId, userId, {
            proposed: doc.proposedCrmFields || {},
            extractedLeadId: doc.extractedLeadId,
            sourceUrl: doc.sourceReferences?.[0]?.sourceUrl || '',
        });
        const tx = await AiCrmEnrichmentTransaction.create({
            companyId, draftId: doc._id, crmEntityType: 'LEAD', crmEntityId: lead._id,
            actionType: 'CREATE_LEAD_DRAFT', status: 'APPLIED', beforeValues: {},
            appliedValues: { customerName: lead.customerName, customerEmail: lead.customerEmail, customerMobile: lead.customerMobile },
            rejectedValues: {}, sourceReferences: doc.sourceReferences || [],
            approvalReference: String(doc._id), reason: payload.reason || 'Create CRM Lead from approved draft',
            appliedBy: userId, appliedAt: new Date(), rollbackCapability: true,
            idempotencyKey: `create-lead:${doc._id}`, createdBy: userId,
            auditEntries: [{ at: new Date().toISOString(), action: 'lead_created' }],
        });
        doc.convertedCrmLeadId = lead._id;
        doc.enrichmentTransactionId = tx._id;
        doc.status = 'CONVERTED_TO_LEAD';
        doc.conversionStatus = 'created';
        doc.rollbackMetadata = { transactionId: tx._id, action: 'soft_cancel_lead_preferred' };
        doc.updatedBy = userId;
        doc.history = [...(doc.history || []), historyEntry('create_lead', userId, previous, doc.toObject(), 'CRM Lead created', 'LEAD', String(lead._id))].slice(-100);
        await doc.save();
        if (doc.extractedLeadId) {
            await ExtractedLead.updateOne(
                { _id: doc.extractedLeadId, companyId, status: { $ne: 'converted' } },
                { $set: { status: 'converted', convertedTo: { entityType: 'lead', refId: lead._id, convertedAt: new Date(), convertedBy: userId } } },
            );
        }
        return { idempotent: false, lead: lead.toObject?.() || lead, transaction: tx.toObject(), draft: doc.toObject() };
    } catch (err) {
        doc.status = 'FAILED';
        doc.history = [...(doc.history || []), historyEntry('create_lead_failed', userId, previous, doc.toObject(), err?.message || 'failed')].slice(-100);
        await doc.save();
        throw err;
    }
}

export async function applyEnrichmentFromDraft(companyId, userId, id, payload = {}, user = null) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.crm_enrichment.apply');
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    if (doc.status !== 'APPROVED') throw new ApiError(400, 'Final approval required before applying enrichment');
    const entityType = doc.matchedCrmEntityType;
    if (!['LEAD', 'CUSTOMER', 'SUPPLIER'].includes(entityType) || !doc.matchedCrmEntityId) {
        throw new ApiError(400, 'No matched CRM entity to enrich');
    }
    if (entityType === 'LEAD') requirePerm(user, CRM_EDIT_LEAD_PERM);
    if (entityType === 'CUSTOMER') requirePerm(user, CRM_EDIT_CUSTOMER_PERM);
    if (entityType === 'SUPPLIER') requirePerm(user, CRM_EDIT_SUPPLIER_PERM);

    if (doc.enrichmentTransactionId && doc.status === 'ENRICHED_EXISTING_RECORD') {
        const tx = await AiCrmEnrichmentTransaction.findOne({ _id: doc.enrichmentTransactionId, companyId }).lean();
        return { idempotent: true, transaction: tx, draft: doc.toObject() };
    }
    const pendingConflicts = (doc.fieldComparisons || []).filter((c) => c.changeType === 'CONFLICT' && c.userDecision === 'PENDING');
    if (pendingConflicts.length) throw new ApiError(400, 'Conflicting fields require explicit decisions');

    const before = await loadCrmEntity(companyId, entityType, doc.matchedCrmEntityId);
    const { patch, applied, rejected, alternates } = buildPatchFromDecisions({
        entityType, comparisons: doc.fieldComparisons, proposed: doc.proposedCrmFields,
    });
    const previous = doc.toObject();
    doc.status = 'CONVERSION_IN_PROGRESS';
    await doc.save();
    try {
        const result = await applyCrmEnrichment(companyId, userId, {
            entityType, entityId: doc.matchedCrmEntityId, patch, user, settings: payload.settings || {},
        });
        const tx = await AiCrmEnrichmentTransaction.create({
            companyId, draftId: doc._id, crmEntityType: entityType, crmEntityId: doc.matchedCrmEntityId,
            actionType: doc.draftActionType,
            status: Object.keys(applied).length ? 'APPLIED' : 'PARTIALLY_APPLIED',
            beforeValues: {
                customerName: before.customerName || before.company || before.supplierName,
                customerEmail: before.customerEmail || before.companyEmail || before.email,
                customerMobile: before.customerMobile || before.phone,
                notes: before.notes || before.remarks, address: before.address, website: before.website,
            },
            appliedValues: applied, rejectedValues: rejected, alternateValues: alternates,
            sourceReferences: doc.sourceReferences || [], approvalReference: String(doc._id),
            reason: payload.reason || 'Apply approved enrichment', appliedBy: userId, appliedAt: new Date(),
            rollbackCapability: true, idempotencyKey: `enrich:${doc._id}:${doc.matchedCrmEntityId}`,
            createdBy: userId, auditEntries: [{ at: new Date().toISOString(), action: 'enrichment_applied', fields: Object.keys(applied) }],
        });
        doc.enrichmentTransactionId = tx._id;
        doc.status = Object.keys(applied).length ? 'ENRICHED_EXISTING_RECORD' : 'PARTIALLY_APPLIED';
        doc.conversionStatus = 'enriched';
        doc.rollbackMetadata = { transactionId: tx._id, beforeValues: tx.beforeValues };
        doc.updatedBy = userId;
        doc.history = [...(doc.history || []), historyEntry('apply_enrichment', userId, previous, doc.toObject(), 'Enrichment applied', entityType, String(doc.matchedCrmEntityId))].slice(-100);
        await doc.save();
        return { idempotent: false, transaction: tx.toObject(), entity: result.entity, draft: doc.toObject() };
    } catch (err) {
        doc.status = 'FAILED';
        doc.history = [...(doc.history || []), historyEntry('apply_failed', userId, previous, doc.toObject(), err?.message || 'failed')].slice(-100);
        await doc.save();
        throw err;
    }
}

export async function rejectDraft(companyId, userId, id, payload = {}) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    if (doc.locked) throw new ApiError(400, 'Draft is locked');
    const previous = doc.toObject();
    doc.status = 'REJECTED';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('reject', userId, previous, doc.toObject(), payload.reason || 'Rejected')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function lockDraft(companyId, userId, id, payload = {}) {
    await ensureCrmEnrichmentStores();
    rejectTenantOverrides(payload);
    const doc = await AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Draft not found');
    const previous = doc.toObject();
    const action = String(payload.action || 'lock');
    if (action === 'lock') {
        doc.locked = true; doc.lockedAt = new Date(); doc.lockedBy = userId;
        if (doc.status === 'APPROVED') doc.status = 'LOCKED';
    } else if (action === 'unlock') {
        doc.locked = false; doc.lockedAt = null; doc.lockedBy = null;
        if (doc.status === 'LOCKED') doc.status = 'APPROVED';
    } else throw new ApiError(400, 'action must be lock or unlock');
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function exportDrafts(companyId, query = {}) {
    await ensureCrmEnrichmentStores();
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const rows = await AiCrmEnrichmentDraft.find(q).sort({ updatedAt: -1 }).limit(500).lean();
    return {
        format: String(query.format || 'json'),
        results: rows.map((r) => ({
            companyName: r.companyName, eligibilityStatus: r.eligibilityStatus, matchStatus: r.matchStatus,
            draftActionType: r.draftActionType, status: r.status, matchScore: r.matchScore,
            converted: !!r.convertedCrmLeadId,
            sources: (r.sourceReferences || []).map((s) => s.sourceUrl).filter(Boolean),
        })),
    };
}
