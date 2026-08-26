import mongoose from 'mongoose';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { ensureModelIndexes } from '../../../utils/ensureModelIndexes.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getActiveRoles } from './roleMaster.service.js';
import { analyzeCompanyContacts } from './analyze.service.js';

async function ensureContactIntelligenceStore() {
    await ensureModelIndexes(AiContactIntelligence);
}

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function historyEntry(action, userId, previous, next, reason = '') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous,
        next,
        reason: String(reason || '').slice(0, 2000),
    };
}

function recordKeyOf(meta = {}) {
    if (meta.extractedLeadId) return 'lead:' + String(meta.extractedLeadId);
    if (meta.discoveryJobId != null && meta.previewIndex != null) return 'job:' + String(meta.discoveryJobId) + ':' + String(meta.previewIndex);
    if (meta.adhocKey) return 'adhoc:' + String(meta.adhocKey);
    return '';
}

function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/password|cookie|authorization|bearer\s|sessiontoken|sk-[a-z0-9]|openai_api_key/i.test(blob)) {
        throw new ApiError(500, 'Refusing to store or return secret/session values');
    }
}

export async function listContactIntelligence(companyId, query = {}) {
    await ensureContactIntelligenceStore();
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.parentIndustry) q.parentIndustry = query.parentIndustry;
    if (query.customerType) q.customerType = query.customerType;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.contactRole) q['primaryContact.contactRoleCategory'] = query.contactRole;
    if (query.verificationStatus) q['primaryContact.verificationStatus'] = query.verificationStatus;
    if (query.emailAvailable === 'true') q['primaryContact.email'] = { $nin: [null, ''] };
    if (query.phoneAvailable === 'true') q['primaryContact.phone'] = { $nin: [null, ''] };
    if (query.minDecisionScore != null) q.decisionMakerScore = { $gte: Number(query.minDecisionScore) };
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiContactIntelligence.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiContactIntelligence.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getContactIntelligence(companyId, id) {
    await ensureContactIntelligenceStore();
    const doc = await AiContactIntelligence.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Contact intelligence not found');
    return doc;
}

export async function getContactHistory(companyId, id) {
    await ensureContactIntelligenceStore();
    const doc = await getContactIntelligence(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [], mergeHistory: doc.mergeHistory || [] };
}

export async function analyzeOne(companyId, userId, payload = {}) {
    await ensureContactIntelligenceStore();
    rejectTenantOverrides(payload);
    const roles = await getActiveRoles(companyId);
    let record = payload.record || null;
    let classification = payload.classification || null;
    let relevance = payload.relevance || null;
    let recommendation = payload.recommendation || null;
    const meta = {
        financialYear: payload.financialYear || '',
        extractedLeadId: payload.extractedLeadId || null,
        discoveryJobId: payload.discoveryJobId || null,
        previewIndex: payload.previewIndex != null ? Number(payload.previewIndex) : null,
        classificationId: payload.classificationId || null,
        relevanceId: payload.relevanceId || null,
        recommendationId: payload.recommendationId || null,
        adhocKey: payload.adhocKey || null,
    };

    if (payload.extractedLeadId) {
        const lead = await ExtractedLead.findOne({ _id: payload.extractedLeadId, companyId }).lean();
        if (!lead) throw new ApiError(404, 'Extracted lead not found');
        record = lead;
        meta.extractedLeadId = lead._id;
        meta.financialYear = lead.financialYear || meta.financialYear;
    }
    if (payload.classificationId) {
        classification = await AiIndustryClassification.findOne({ _id: payload.classificationId, companyId, isDeleted: { $ne: true } }).lean();
        if (!classification) throw new ApiError(404, 'Classification not found');
        meta.classificationId = classification._id;
        record = record || { companyName: classification.companyName };
    }
    if (payload.relevanceId) {
        relevance = await AiLeadRelevance.findOne({ _id: payload.relevanceId, companyId, isDeleted: { $ne: true } }).lean();
        if (!relevance) throw new ApiError(404, 'Relevance not found');
        meta.relevanceId = relevance._id;
    }
    if (payload.recommendationId) {
        recommendation = await AiProductRecommendation.findOne({ _id: payload.recommendationId, companyId, isDeleted: { $ne: true } }).lean();
        if (!recommendation) throw new ApiError(404, 'Recommendation not found');
        meta.recommendationId = recommendation._id;
    }
    if (!record) throw new ApiError(400, 'record or extractedLeadId required');

    const key = recordKeyOf(meta) || ('adhoc:' + new mongoose.Types.ObjectId().toString());
    const existing = await AiContactIntelligence.findOne({ companyId, recordKey: key, isDeleted: { $ne: true } });
    if (existing?.locked && !payload.force) {
        return { skipped: true, reason: 'locked', analysis: existing.toObject() };
    }
    if (existing?.manuallyApproved && !payload.force) {
        return { skipped: true, reason: 'manual_approved', analysis: existing.toObject() };
    }

    const result = analyzeCompanyContacts({
        record,
        roles,
        classification,
        relevance,
        recommendation,
        options: {
            opportunityType: payload.opportunityType || '',
            inferredEmails: payload.inferredEmails || [],
            imported: payload.imported === true,
            sourceType: payload.sourceType || '',
        },
    });
    assertNoSecrets(result);

    const docPayload = {
        companyId,
        financialYear: meta.financialYear || '',
        extractedLeadId: meta.extractedLeadId || null,
        discoveryJobId: meta.discoveryJobId || null,
        previewIndex: meta.previewIndex,
        classificationId: meta.classificationId || null,
        relevanceId: meta.relevanceId || null,
        recommendationId: meta.recommendationId || null,
        recordKey: key,
        companyName: result.companyName,
        status: result.status,
        parentIndustry: result.parentIndustry,
        customerType: result.customerType,
        opportunityType: result.opportunityType,
        recommendedProduct: result.recommendedProduct,
        contacts: result.contacts || [],
        primaryContact: result.primaryContact,
        secondaryContacts: result.secondaryContacts || [],
        genericFallbackContact: result.genericFallbackContact,
        decisionMakerScore: result.decisionMakerScore,
        contactQualityScore: result.contactQualityScore,
        confidence: result.confidence,
        whyRecommended: result.whyRecommended,
        warnings: result.warnings || [],
        engineUsed: result.engineUsed,
        modelVersion: result.modelVersion,
        analysisTimestamp: new Date(),
        rawPayload: result,
        updatedBy: userId || null,
    };

    if (!existing) {
        const created = await AiContactIntelligence.create({
            ...docPayload,
            createdBy: userId || null,
            history: [historyEntry('analyzed', userId, null, result, 'initial contact analysis')],
        });
        return { skipped: false, analysis: created.toObject() };
    }

    // Preserve locked individual contacts / manually verified fields where possible
    const previous = existing.toObject();
    const preserved = (existing.contacts || []).filter((c) => c.isLocked || c.isManuallyApproved || c.verificationStatus === 'MANUALLY_VERIFIED');
    if (preserved.length) {
        const keys = new Set(preserved.map((c) => c.contactKey));
        docPayload.contacts = [
            ...preserved,
            ...(docPayload.contacts || []).filter((c) => !keys.has(c.contactKey)),
        ];
    }
    Object.assign(existing, docPayload);
    existing.history = [...(existing.history || []), historyEntry('reanalyzed', userId, previous, result, 're-run')].slice(-100);
    await existing.save();
    return { skipped: false, analysis: existing.toObject() };
}

export async function overrideContactAnalysis(companyId, userId, id, payload = {}) {
    await ensureContactIntelligenceStore();
    rejectTenantOverrides(payload);
    const doc = await AiContactIntelligence.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Contact intelligence not found');
    if (doc.locked && !['unlock'].includes(payload.action)) throw new ApiError(400, 'Contact analysis is locked');

    const previous = doc.toObject();
    const action = String(payload.action || 'override');

    if (action === 'accept') {
        doc.manuallyApproved = true;
        if (doc.primaryContact) {
            doc.primaryContact.isManuallyApproved = true;
            doc.primaryContact.verificationStatus = doc.primaryContact.verificationStatus === 'INFERRED_UNVERIFIED'
                ? 'INFERRED_UNVERIFIED'
                : (doc.primaryContact.verificationStatus || 'MANUALLY_VERIFIED');
        }
        if (doc.status === 'MANUAL_REVIEW_REQUIRED' || doc.status === 'LOW_CONFIDENCE') doc.status = 'CONTACT_FOUND';
    } else if (action === 'mark_invalid') {
        doc.status = 'INVALID';
        if (payload.contactKey) {
            doc.contacts = (doc.contacts || []).map((c) => (
                c.contactKey === payload.contactKey
                    ? { ...c.toObject?.() || c, verificationStatus: 'INVALID', isActive: false, warnings: [...(c.warnings || []), 'Marked invalid'] }
                    : c
            ));
        }
    } else if (action === 'mark_verified') {
        if (payload.contactKey) {
            doc.contacts = (doc.contacts || []).map((c) => {
                if (c.contactKey !== payload.contactKey) return c;
                if (c.verificationStatus === 'INFERRED_UNVERIFIED') {
                    throw new ApiError(400, 'INFERRED_UNVERIFIED contacts cannot be marked verified without replacing with public source evidence');
                }
                return { ...c.toObject?.() || c, verificationStatus: 'MANUALLY_VERIFIED', isManuallyApproved: true };
            });
            if (doc.primaryContact?.contactKey === payload.contactKey) {
                if (doc.primaryContact.verificationStatus === 'INFERRED_UNVERIFIED') {
                    throw new ApiError(400, 'INFERRED_UNVERIFIED contacts cannot be marked verified');
                }
                doc.primaryContact.verificationStatus = 'MANUALLY_VERIFIED';
                doc.primaryContact.isManuallyApproved = true;
            }
        }
        doc.manuallyApproved = true;
    } else if (action === 'set_primary') {
        const found = (doc.contacts || []).find((c) => c.contactKey === payload.contactKey);
        if (!found) throw new ApiError(404, 'Contact not found');
        if (found.verificationStatus === 'INFERRED_UNVERIFIED') {
            throw new ApiError(400, 'Cannot set inferred unverified contact as primary');
        }
        doc.contacts = (doc.contacts || []).map((c) => ({ ...c.toObject?.() || c, isPrimaryContact: c.contactKey === payload.contactKey }));
        doc.primaryContact = { ...found.toObject?.() || found, isPrimaryContact: true };
        doc.secondaryContacts = (doc.contacts || []).filter((c) => c.contactKey !== payload.contactKey && !c.isGenericCompanyContact).slice(0, 4);
        doc.manuallyApproved = true;
    } else if (action === 'override') {
        if (payload.contactKey && payload.role) {
            doc.contacts = (doc.contacts || []).map((c) => (
                c.contactKey === payload.contactKey
                    ? { ...c.toObject?.() || c, contactRoleCategory: String(payload.role), department: payload.department || c.department }
                    : c
            ));
            if (doc.primaryContact?.contactKey === payload.contactKey) {
                doc.primaryContact.contactRoleCategory = String(payload.role);
                if (payload.department) doc.primaryContact.department = String(payload.department);
            }
        }
        if (payload.addContact && typeof payload.addContact === 'object') {
            const add = payload.addContact;
            if (add.inferred) add.verificationStatus = 'INFERRED_UNVERIFIED';
            doc.contacts = [...(doc.contacts || []), {
                contactKey: add.contactKey || `manual:${Date.now()}`,
                contactName: add.contactName || '',
                designation: add.designation || '',
                department: add.department || '',
                contactRoleCategory: add.role || add.contactRoleCategory || 'Unknown',
                email: add.email || '',
                phone: add.phone || '',
                sourceType: 'manual',
                verificationStatus: add.verificationStatus || 'MANUALLY_VERIFIED',
                confidence: Number(add.confidence) || 80,
                isManuallyApproved: true,
                provenance: [{ field: 'manual', value: add.contactName || add.email || add.phone || '', sourceType: 'manual', collectedAt: new Date(), verificationStatus: add.verificationStatus || 'MANUALLY_VERIFIED', confidence: 80 }],
            }];
        }
        doc.manuallyApproved = true;
    } else if (action === 'merge') {
        const keepKey = payload.keepContactKey;
        const dropKey = payload.dropContactKey;
        if (!keepKey || !dropKey) throw new ApiError(400, 'keepContactKey and dropContactKey required');
        const keep = (doc.contacts || []).find((c) => c.contactKey === keepKey);
        const drop = (doc.contacts || []).find((c) => c.contactKey === dropKey);
        if (!keep || !drop) throw new ApiError(404, 'Merge contacts not found');
        if (keep.contactName && drop.contactName
            && keep.contactName.toLowerCase() === drop.contactName.toLowerCase()
            && !keep.email && !drop.email && !keep.phone && !drop.phone) {
            // similar name alone already flagged — still require explicit merge
        }
        doc.mergeHistory = [...(doc.mergeHistory || []), {
            at: new Date(),
            userId,
            keepContactKey: keepKey,
            dropContactKey: dropKey,
            before: { keep, drop },
            reason: payload.reason || 'Manual merge',
        }];
        const merged = {
            ...drop.toObject?.() || drop,
            ...keep.toObject?.() || keep,
            email: keep.email || drop.email,
            phone: keep.phone || drop.phone,
            provenance: [...(keep.provenance || []), ...(drop.provenance || [])],
            duplicateStatus: 'UNIQUE',
        };
        doc.contacts = (doc.contacts || []).filter((c) => c.contactKey !== dropKey).map((c) => (c.contactKey === keepKey ? merged : c));
        if (doc.primaryContact?.contactKey === dropKey) doc.primaryContact = merged;
    } else if (action === 'keep_separate') {
        doc.contacts = (doc.contacts || []).map((c) => (
            [payload.contactKey, payload.otherContactKey].includes(c.contactKey)
                ? { ...c.toObject?.() || c, duplicateStatus: 'UNIQUE', duplicateOfKey: '' }
                : c
        ));
    } else {
        throw new ApiError(400, 'Invalid override action');
    }

    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function lockContactAnalysis(companyId, userId, id, payload = {}) {
    await ensureContactIntelligenceStore();
    rejectTenantOverrides(payload);
    const doc = await AiContactIntelligence.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Contact intelligence not found');
    const previous = doc.toObject();
    const action = String(payload.action || 'lock');
    if (action === 'lock') {
        doc.locked = true;
        doc.lockedAt = new Date();
        doc.lockedBy = userId;
    } else if (action === 'unlock') {
        doc.locked = false;
        doc.lockedAt = null;
        doc.lockedBy = null;
    } else {
        throw new ApiError(400, 'action must be lock or unlock');
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function exportApprovedContacts(companyId, query = {}) {
    await ensureContactIntelligenceStore();
    const q = {
        companyId,
        isDeleted: { $ne: true },
        $or: [{ manuallyApproved: true }, { 'primaryContact.verificationStatus': 'MANUALLY_VERIFIED' }, { status: 'CONTACT_FOUND' }, { status: 'MULTIPLE_CONTACTS' }],
    };
    if (query.onlyVerified === 'true') {
        q['primaryContact.verificationStatus'] = { $in: ['MANUALLY_VERIFIED', 'SOURCE_VERIFIED', 'MULTIPLE_SOURCE_CONFIRMED'] };
    }
    const rows = await AiContactIntelligence.find(q).sort({ updatedAt: -1 }).limit(500).lean();
    return {
        results: rows.map((r) => ({
            companyName: r.companyName,
            status: r.status,
            primaryContact: r.primaryContact,
            secondaryContacts: r.secondaryContacts,
            genericFallbackContact: r.genericFallbackContact,
            decisionMakerScore: r.decisionMakerScore,
            verificationStatus: r.primaryContact?.verificationStatus,
        })),
    };
}
