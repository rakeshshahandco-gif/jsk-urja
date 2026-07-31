import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiMarketingCampaignDraft } from '../../../models/aiMarketingCampaignDraft.model.js';
import { AiMarketingCampaignRecipient } from '../../../models/aiMarketingCampaignRecipient.model.js';
import { CAMPAIGN_TYPES, CHANNEL_DRAFT_TYPES, ENGINE_VERSION } from './constants.js';
import { getMarketingSettings } from './settings.service.js';
import { validateAudienceFilters, audienceFilterFingerprint, buildExtractedLeadQuery } from './filters.util.js';
import {
    assertNoSecrets, fingerprint, historyEntry, normalizeEmail, normalizePhone,
    rejectTenantOverrides,
} from './normalize.util.js';
import { selectContact } from './contactMatch.service.js';
import { evaluateRecipientEligibility } from './eligibility.service.js';
import { getEmailBlacklistSet, getWhatsAppBlacklistSet, checkOptOut } from './optout.adapter.js';
import { checkFrequency } from './frequency.adapter.js';
import { dedupeRecipients } from './duplicate.service.js';
import { recommendContent } from './content.service.js';
import { generateMessageDraft } from './message.service.js';

function requirePerm(user, key) {
    if (!checkUserPermission(user, key) && !checkUserPermission(user, 'data_extractor.marketing_intelligence.manage')) {
        throw new ApiError(403, `Missing permission: ${key}`);
    }
}

function stripContactDetails(row) {
    const {
        contactName, email, phone, sourceUrl, normalizedEmail, normalizedPhone, alternativeContacts, ...rest
    } = row || {};
    return rest;
}

export function canSeeContactDetails(user) {
    return checkUserPermission(user, 'data_extractor.marketing_intelligence.review_recipients')
        || checkUserPermission(user, 'data_extractor.marketing_intelligence.manage')
        || checkUserPermission(user, 'crm.leads.view');
}

async function loadDraft(companyId, id) {
    const doc = await AiMarketingCampaignDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Campaign Draft not found');
    return doc;
}

export async function listCampaigns(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.campaignType) q.campaignType = query.campaignType;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [items, total] = await Promise.all([
        AiMarketingCampaignDraft.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiMarketingCampaignDraft.countDocuments(q),
    ]);
    return { items, total, limit, skip };
}

export async function getCampaign(companyId, id, user = null) {
    const doc = await loadDraft(companyId, id);
    const obj = doc.toObject();
    assertNoSecrets(obj);
    if (user && !canSeeContactDetails(user) && obj.handoffPackage?.recipients) {
        obj.handoffPackage = {
            ...obj.handoffPackage,
            recipients: (obj.handoffPackage.recipients || []).map((r) => stripContactDetails(r)),
            aggregateOnly: true,
        };
    }
    return obj;
}

export async function createCampaign(companyId, userId, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.create');
    const settings = await getMarketingSettings(companyId);
    if (settings.enabled === false) throw new ApiError(400, 'Marketing Intelligence is disabled');

    const campaignType = String(payload.campaignType || 'MANUAL_CUSTOM');
    const channelDraftType = String(payload.channelDraftType || 'EXPORT_ONLY');
    if (!CAMPAIGN_TYPES.includes(campaignType)) throw new ApiError(400, 'Invalid campaignType');
    if (!CHANNEL_DRAFT_TYPES.includes(channelDraftType)) throw new ApiError(400, 'Invalid channelDraftType');
    if (!settings.allowedCampaignTypes.includes(campaignType)) throw new ApiError(400, 'Campaign type not allowed');
    if (!settings.allowedDraftChannels.includes(channelDraftType)) throw new ApiError(400, 'Channel draft type not allowed');

    const filters = validateAudienceFilters(payload.audienceFilters || {});
    const name = String(payload.name || '').trim();
    if (!name) throw new ApiError(400, 'Campaign name required');

    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiMarketingCampaignDraft.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existing) return { idempotent: true, campaign: existing.toObject() };
    }

    const doc = await AiMarketingCampaignDraft.create({
        companyId,
        financialYear: payload.financialYear || '',
        name,
        campaignType,
        channelDraftType,
        objective: String(payload.objective || '').slice(0, 1000),
        language: payload.language || settings.defaultLanguage || 'en',
        status: 'DRAFT',
        audienceFilters: filters,
        audienceFilterFingerprint: audienceFilterFingerprint(filters),
        scheduleDraft: payload.scheduleDraft || null,
        safeModeSuggestions: settings.safeModeSuggestionDefaults,
        idempotencyKey,
        createdBy: userId,
        updatedBy: userId,
        messageNotSent: true,
        messageReviewRequired: true,
        handoffStatus: 'NOT_READY',
        history: [historyEntry('create', userId, null, { status: 'DRAFT' }, 'Campaign Draft created')],
        engineVersion: ENGINE_VERSION,
    });
    assertNoSecrets(doc.toObject());
    return { idempotent: false, campaign: doc.toObject() };
}

export async function updateCampaign(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.create');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    if (['APPROVED_FOR_HANDOFF', 'CANCELLED'].includes(doc.status)) {
        throw new ApiError(400, 'Cannot edit campaign in current status');
    }
    const previous = doc.toObject();
    if (payload.name != null) doc.name = String(payload.name).trim();
    if (payload.objective != null) doc.objective = String(payload.objective).slice(0, 1000);
    if (payload.language != null) doc.language = String(payload.language);
    if (payload.audienceFilters != null) {
        doc.audienceFilters = validateAudienceFilters(payload.audienceFilters);
        doc.audienceFilterFingerprint = audienceFilterFingerprint(doc.audienceFilters);
    }
    if (payload.scheduleDraft != null) doc.scheduleDraft = payload.scheduleDraft;
    if (payload.campaignType && CAMPAIGN_TYPES.includes(payload.campaignType)) doc.campaignType = payload.campaignType;
    if (payload.channelDraftType && CHANNEL_DRAFT_TYPES.includes(payload.channelDraftType)) {
        doc.channelDraftType = payload.channelDraftType;
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('update', userId, previous, doc.toObject(), payload.reason || 'Updated')].slice(-100);
    await doc.save();
    return doc.toObject();
}

function recipientKeyFor(lead, selected) {
    return fingerprint([
        lead?._id,
        selected?.normalizedEmail || selected?.email,
        selected?.normalizedPhone || selected?.phone,
    ]);
}

/**
 * Build audience from approved ExtractedLead + Contact Intelligence.
 * Does NOT use approximate Phase 15 analytics totals as recipients.
 */
export async function buildAudience(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.build_audience');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');

    const settings = await getMarketingSettings(companyId);
    const filters = validateAudienceFilters(payload.audienceFilters || doc.audienceFilters || {});
    doc.audienceFilters = filters;
    doc.audienceFilterFingerprint = audienceFilterFingerprint(filters);
    doc.status = 'AUDIENCE_PREPARING';
    doc.updatedBy = userId;
    await doc.save();

    const leadQuery = buildExtractedLeadQuery(companyId, filters);
    const maxAudience = settings.maximumDraftAudience;
    const previewLimit = Math.min(settings.audiencePreviewLimit, maxAudience);

    if (payload.confirmLargeAudience !== true) {
        const candidateCount = await ExtractedLead.countDocuments(leadQuery);
        if (candidateCount > settings.previewConfirmThreshold) {
            doc.status = 'AUDIENCE_REVIEW_REQUIRED';
            await doc.save();
            return {
                requiresConfirmation: true,
                candidateCount,
                previewThreshold: settings.previewConfirmThreshold,
                message: 'Large audience — set confirmLargeAudience=true to prepare',
            };
        }
    }

    const leads = await ExtractedLead.find(leadQuery).sort({ updatedAt: -1 }).limit(maxAudience).lean();
    const leadIds = leads.map((l) => l._id);
    const [contacts, scores, relevance, emailBl, waBl] = await Promise.all([
        AiContactIntelligence.find({ companyId, extractedLeadId: { $in: leadIds }, isDeleted: { $ne: true } }).lean(),
        AiLeadScore.find({ companyId, extractedLeadId: { $in: leadIds }, isDeleted: { $ne: true } }).lean().catch(() => []),
        AiLeadRelevance.find({ companyId, extractedLeadId: { $in: leadIds }, isDeleted: { $ne: true } }).lean().catch(() => []),
        getEmailBlacklistSet(companyId),
        getWhatsAppBlacklistSet(companyId),
    ]);

    const contactByLead = new Map(contacts.map((c) => [String(c.extractedLeadId), c]));
    const scoreByLead = new Map((scores || []).map((s) => [String(s.extractedLeadId), s]));
    const relByLead = new Map((relevance || []).map((r) => [String(r.extractedLeadId), r]));

    // Optional score/relevance filters applied in-memory after fetch
    let filteredLeads = leads;
    if (filters.leadScoreMin != null || filters.leadScoreMax != null) {
        filteredLeads = filteredLeads.filter((l) => {
            const s = scoreByLead.get(String(l._id));
            const score = Number(s?.finalScore ?? l.leadScore ?? 0);
            if (filters.leadScoreMin != null && score < Number(filters.leadScoreMin)) return false;
            if (filters.leadScoreMax != null && score > Number(filters.leadScoreMax)) return false;
            return true;
        });
    }
    if (filters.priority) {
        filteredLeads = filteredLeads.filter((l) => String(scoreByLead.get(String(l._id))?.priority || '') === String(filters.priority));
    }
    if (filters.relevanceStatus) {
        filteredLeads = filteredLeads.filter((l) => String(relByLead.get(String(l._id))?.status || '') === String(filters.relevanceStatus));
    }

    const rows = [];
    for (const lead of filteredLeads) {
        if (lead.status === 'rejected') continue;
        const intel = contactByLead.get(String(lead._id));
        const contactApproved = !intel || intel.manuallyApproved === true
            || ['CONTACT_FOUND', 'MULTIPLE_CONTACTS', 'GENERIC_CONTACT_ONLY'].includes(intel.status);
        // Unapproved Contact Intelligence excluded unless no CI record yet (fallback lead contact)
        const rejectUnapprovedCi = intel && intel.manuallyApproved !== true
            && !['CONTACT_FOUND', 'MULTIPLE_CONTACTS'].includes(intel.status)
            && intel.status !== 'GENERIC_CONTACT_ONLY';

        const { selected, roleMatch, alternatives } = selectContact({
            campaignType: doc.campaignType,
            contactIntel: rejectUnapprovedCi ? null : intel,
            extractedLead: lead,
            settings,
        });

        const optOutResult = checkOptOut({
            email: selected?.email,
            phone: selected?.phone,
            channelDraftType: doc.channelDraftType,
            emailBlacklist: emailBl,
            whatsappBlacklist: waBl,
        });

        let frequencyResult = { status: 'HISTORY_UNAVAILABLE' };
        if (settings.frequencyCheckRequired) {
            // eslint-disable-next-line no-await-in-loop
            frequencyResult = await checkFrequency({
                companyId,
                email: selected?.email,
                phone: selected?.phone,
                campaignType: doc.campaignType,
                settings,
            });
        }

        const elig = evaluateRecipientEligibility({
            selected,
            channelDraftType: doc.channelDraftType,
            settings,
            optOutResult,
            frequencyResult: settings.frequencyCheckRequired ? frequencyResult : { status: 'SAFE_TO_CONTACT' },
            entityStatus: lead.status,
            contactApproved: rejectUnapprovedCi ? false : true,
            lowConfidence: Number(selected?.confidence || 0) > 0 && Number(selected?.confidence || 0) < 30,
            outdated: lead.outdated === true || intel?.status === 'OUTDATED',
        });

        const score = scoreByLead.get(String(lead._id));
        rows.push({
            companyId,
            campaignDraftId: doc._id,
            recipientKey: recipientKeyFor(lead, selected) || String(lead._id),
            extractedLeadId: lead._id,
            crmLeadId: lead.convertedLeadId || lead.crmLeadId || null,
            contactIntelligenceId: intel?._id || null,
            companyName: lead.companyName || lead.name || '',
            contactName: selected?.contactName || '',
            role: selected?.role || '',
            department: selected?.department || '',
            seniority: selected?.seniority || '',
            email: selected?.email || '',
            normalizedEmail: normalizeEmail(selected?.email),
            phone: selected?.phone || '',
            normalizedPhone: normalizePhone(selected?.phone),
            channelEligibility: elig.channels,
            verification: {
                emailVerified: selected?.emailVerified === true,
                phoneVerified: selected?.phoneVerified === true,
            },
            source: selected?.source || '',
            sourceUrl: selected?.sourceUrl || '',
            confidence: Number(selected?.confidence || 0),
            whySelected: selected?.whySelected || roleMatch?.why || '',
            roleMatch: roleMatch?.level || 'MANUAL_REVIEW_REQUIRED',
            alternativeContacts: alternatives,
            eligibilityStatus: elig.status,
            exclusionReason: elig.exclusionReason,
            duplicateStatus: 'UNIQUE',
            optOutResult,
            frequencyResult,
            personalizationValues: {
                contactFirstName: String(selected?.contactName || '').split(/\s+/)[0] || '',
                companyName: lead.companyName || lead.name || '',
                industry: lead.industry || '',
                city: lead.city || '',
                recommendedProduct: '',
            },
            included: elig.included,
            relatedCompanyReview: lead.relatedCompanyReview === true,
            branchReview: lead.branchReview === true,
            leadScore: score?.finalScore ?? null,
            priority: score?.priority || null,
        });
    }

    const deduped = dedupeRecipients(rows, { duplicatePolicy: settings.duplicatePolicy });

    // Idempotent replace of recipients for this campaign
    await AiMarketingCampaignRecipient.deleteMany({ companyId, campaignDraftId: doc._id });
    if (deduped.length) {
        await AiMarketingCampaignRecipient.insertMany(deduped.map((r) => {
            const { relatedCompanyReview, branchReview, leadScore, priority, ...rest } = r;
            return rest;
        }), { ordered: false });
    }

    const stats = summarizeAudience(deduped);
    stats.previewLimit = previewLimit;
    stats.candidateCount = filteredLeads.length;

    const previous = doc.toObject();
    doc.audienceStats = stats;
    doc.status = 'AUDIENCE_REVIEW_REQUIRED';
    doc.updatedBy = userId;
    doc.version = (doc.version || 1) + 1;
    doc.history = [...(doc.history || []), historyEntry('build_audience', userId, previous, doc.toObject(), 'Audience built')].slice(-100);
    await doc.save();

    return {
        campaign: doc.toObject(),
        stats,
        recipientsPreview: canSeeContactDetails(user)
            ? deduped.slice(0, previewLimit)
            : deduped.slice(0, previewLimit).map(stripContactDetails),
        aggregateOnly: !canSeeContactDetails(user),
    };
}

function summarizeAudience(rows = []) {
    const count = (pred) => rows.filter(pred).length;
    return {
        totalCandidates: rows.length,
        eligible: count((r) => r.included),
        emailEligible: count((r) => r.included && r.channelEligibility?.includes('EMAIL')),
        whatsappEligible: count((r) => r.included && r.channelEligibility?.includes('WHATSAPP')),
        manualOnly: count((r) => r.eligibilityStatus === 'ELIGIBLE_MANUAL_ONLY'),
        missingContact: count((r) => r.eligibilityStatus === 'NO_APPROVED_CONTACT'),
        invalidContact: count((r) => ['INVALID_EMAIL', 'INVALID_PHONE'].includes(r.eligibilityStatus)),
        unverified: count((r) => r.eligibilityStatus === 'UNVERIFIED_CONTACT'),
        optedOut: count((r) => r.eligibilityStatus === 'OPTED_OUT'),
        blacklisted: count((r) => r.eligibilityStatus === 'BLACKLISTED'),
        duplicateRemoved: count((r) => r.eligibilityStatus === 'DUPLICATE_CONTACT' || r.duplicateStatus !== 'UNIQUE'),
        recentlyContacted: count((r) => r.eligibilityStatus === 'RECENTLY_CONTACTED'),
        frequencyLimited: count((r) => r.eligibilityStatus === 'CAMPAIGN_FREQUENCY_LIMIT'),
        outdated: count((r) => r.eligibilityStatus === 'OUTDATED_DATA'),
        manualReview: count((r) => r.eligibilityStatus === 'MANUAL_REVIEW_REQUIRED'),
        estimatedHandoffSize: count((r) => r.included),
    };
}

export async function listRecipients(companyId, id, query = {}, user = null) {
    requirePerm(user, 'data_extractor.marketing_intelligence.view');
    await loadDraft(companyId, id);
    const q = { companyId, campaignDraftId: id, isDeleted: { $ne: true } };
    if (query.included === 'true') q.included = true;
    if (query.included === 'false') q.included = false;
    if (query.eligibilityStatus) q.eligibilityStatus = query.eligibilityStatus;
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [items, total] = await Promise.all([
        AiMarketingCampaignRecipient.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiMarketingCampaignRecipient.countDocuments(q),
    ]);
    const show = canSeeContactDetails(user);
    return {
        items: show ? items : items.map(stripContactDetails),
        total,
        limit,
        skip,
        aggregateOnly: !show,
    };
}

export async function reviewRecipients(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.review_recipients');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
    for (const d of decisions) {
        if (!d.recipientId) continue;
        // eslint-disable-next-line no-await-in-loop
        await AiMarketingCampaignRecipient.updateOne(
            { _id: d.recipientId, companyId, campaignDraftId: id },
            {
                $set: {
                    userDecision: d.decision || 'REVIEWED',
                    included: d.included === true,
                    exclusionReason: d.included === true ? '' : (d.reason || 'user_excluded'),
                },
            },
        );
    }
    doc.status = 'RECIPIENT_REVIEW_REQUIRED';
    doc.updatedBy = userId;
    await doc.save();
    const rows = await AiMarketingCampaignRecipient.find({ companyId, campaignDraftId: id, isDeleted: { $ne: true } }).lean();
    doc.audienceStats = summarizeAudience(rows);
    await doc.save();
    return { campaign: doc.toObject(), stats: doc.audienceStats };
}

export async function recommendCampaignContent(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.generate_message');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    const included = await AiMarketingCampaignRecipient.find({
        companyId, campaignDraftId: id, included: true, isDeleted: { $ne: true },
    }).select('extractedLeadId').lean();
    const content = await recommendContent(companyId, {
        extractedLeadIds: included.map((r) => r.extractedLeadId).filter(Boolean),
        campaignType: doc.campaignType,
    });
    doc.productReferences = content.productReferences;
    doc.documentReferences = content.documentReferences;
    doc.status = 'CONTENT_REVIEW_REQUIRED';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('recommend_content', userId, null, doc.toObject(), 'Content recommended')].slice(-100);
    await doc.save();
    return { campaign: doc.toObject(), content };
}

export async function generateCampaignMessage(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.generate_message');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    const settings = await getMarketingSettings(companyId);
    const sample = await AiMarketingCampaignRecipient.findOne({
        companyId, campaignDraftId: id, included: true,
    }).lean();
    const draft = await generateMessageDraft(companyId, {
        campaignType: doc.campaignType,
        channelDraftType: doc.channelDraftType,
        language: payload.language || doc.language,
        productReferences: doc.productReferences,
        templateId: payload.templateId || doc.templateReference?.templateId,
        personalizationValues: {
            ...(sample?.personalizationValues || {}),
            recommendedProduct: doc.productReferences?.[0]?.productName || '',
            ...(payload.personalizationValues || {}),
        },
        settings,
    });
    doc.messageDraft = draft;
    doc.messageStatus = draft.status;
    doc.messageNotSent = true;
    doc.messageReviewRequired = true;
    doc.templateReference = draft.templateReference;
    doc.personalizationPreview = draft.personalizationPreview;
    doc.status = 'MESSAGE_REVIEW_REQUIRED';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('generate_message', userId, null, doc.toObject(), 'Message draft generated')].slice(-100);
    await doc.save();
    assertNoSecrets(doc.toObject());
    return { campaign: doc.toObject(), messageDraft: draft };
}

export async function updateMessage(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.edit_message');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    const prev = doc.messageDraft || {};
    doc.messageDraft = {
        ...prev,
        subject: payload.subject != null ? String(payload.subject) : prev.subject,
        body: payload.body != null ? String(payload.body) : prev.body,
        language: payload.language || prev.language || doc.language,
        notSent: true,
        reviewRequired: true,
        status: 'DRAFT',
        messageFlags: { ...(prev.messageFlags || {}), NOT_SENT: true, REVIEW_REQUIRED: true },
    };
    doc.messageStatus = 'DRAFT';
    doc.messageNotSent = true;
    doc.updatedBy = userId;
    assertNoSecrets(doc.messageDraft);
    await doc.save();
    return doc.toObject();
}

export async function setApprovals(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    const approvals = doc.approvals || {};
    const now = new Date();

    if (payload.approveAudience === true) {
        requirePerm(user, 'data_extractor.marketing_intelligence.approve_audience');
        approvals.audienceApproved = true;
        approvals.audienceApprovedAt = now;
        approvals.audienceApprovedBy = userId;
    }
    if (payload.approveRecipients === true) {
        requirePerm(user, 'data_extractor.marketing_intelligence.review_recipients');
        approvals.recipientsApproved = true;
        approvals.recipientsApprovedAt = now;
        approvals.recipientsApprovedBy = userId;
    }
    if (payload.approveMessage === true) {
        requirePerm(user, 'data_extractor.marketing_intelligence.approve_message');
        approvals.messageApproved = true;
        approvals.messageApprovedAt = now;
        approvals.messageApprovedBy = userId;
    }
    if (payload.approveContent === true) {
        requirePerm(user, 'data_extractor.marketing_intelligence.approve_content');
        approvals.contentApproved = true;
        approvals.contentApprovedAt = now;
        approvals.contentApprovedBy = userId;
    }
    if (payload.approveSchedule === true) {
        requirePerm(user, 'data_extractor.marketing_intelligence.approve_handoff');
        approvals.scheduleApproved = true;
        approvals.scheduleApprovedAt = now;
        approvals.scheduleApprovedBy = userId;
    }

    doc.approvals = approvals;
    const required = ['audienceApproved', 'recipientsApproved', 'messageApproved'];
    const settings = await getMarketingSettings(companyId);
    if (settings.approvedDocumentRequired) required.push('contentApproved');
    const allReq = required.every((k) => approvals[k] === true);
    if (allReq) doc.status = 'READY_FOR_APPROVAL';
    else doc.status = 'PARTIALLY_APPROVED';
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function finalApprove(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.approve_handoff');
    const doc = await loadDraft(companyId, id);
    if (doc.locked) throw new ApiError(400, 'Campaign Draft is locked');
    const a = doc.approvals || {};
    if (!a.audienceApproved || !a.recipientsApproved || !a.messageApproved) {
        throw new ApiError(400, 'Audience, recipients and message approvals required before final approval');
    }
    const settings = await getMarketingSettings(companyId);
    if (settings.approvedDocumentRequired && !a.contentApproved) {
        throw new ApiError(400, 'Content approval required');
    }
    if (doc.messageNotSent !== true) {
        throw new ApiError(400, 'Message must remain NOT_SENT');
    }
    doc.status = 'APPROVED_FOR_HANDOFF';
    doc.approvals.handoffApproved = true;
    doc.approvals.handoffApprovedAt = new Date();
    doc.approvals.handoffApprovedBy = userId;
    doc.handoffStatus = 'READY_FOR_HANDOFF';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('final_approve', userId, null, doc.toObject(), payload.reason || 'Final handoff approval')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function prepareHandoff(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.prepare_handoff');
    const doc = await loadDraft(companyId, id);
    if (doc.status !== 'APPROVED_FOR_HANDOFF' && payload.force !== true) {
        throw new ApiError(400, 'Final handoff approval required before preparing handoff package');
    }
    if (!doc.approvals?.handoffApproved) {
        throw new ApiError(400, 'Handoff approval required');
    }

    const recipients = await AiMarketingCampaignRecipient.find({
        companyId, campaignDraftId: id, included: true, isDeleted: { $ne: true },
    }).lean();

    const show = canSeeContactDetails(user);
    const recipientRefs = recipients.map((r) => ({
        recipientId: r._id,
        extractedLeadId: r.extractedLeadId,
        crmLeadId: r.crmLeadId,
        companyName: show ? r.companyName : undefined,
        contactName: show ? r.contactName : undefined,
        email: show ? r.email : undefined,
        phone: show ? r.phone : undefined,
        channelEligibility: r.channelEligibility,
        eligibilityStatus: r.eligibilityStatus,
        personalizationValues: show ? r.personalizationValues : undefined,
    }));

    const handoff = {
        campaignDraftId: doc._id,
        campaignName: doc.name,
        channel: doc.channelDraftType,
        approvedRecipientCount: recipients.length,
        approvedRecipientReferences: recipientRefs,
        messageTemplateReference: doc.templateReference || null,
        messageDraftReference: {
            subject: doc.messageDraft?.subject || '',
            // body included for manual export only — still NOT_SENT
            body: doc.messageDraft?.body || '',
            notSent: true,
            status: doc.messageStatus,
        },
        documentReferences: doc.documentReferences || [],
        productReferences: doc.productReferences || [],
        proposedSchedule: doc.scheduleDraft || null,
        safeModeSuggestions: doc.safeModeSuggestions || null,
        optOutValidatedAt: new Date().toISOString(),
        duplicateValidatedAt: new Date().toISOString(),
        approvalMetadata: doc.approvals,
        version: doc.version,
        companyId: String(companyId),
        fingerprint: fingerprint([doc._id, doc.audienceFilterFingerprint, doc.version, recipients.length]),
        executable: false,
        sendEndpoint: null,
        note: 'Non-executable handoff package. Do not call WhatsApp, Email, or Bulk Messaging APIs.',
    };
    assertNoSecrets(handoff);

    doc.handoffPackage = handoff;
    doc.handoffStatus = 'READY_FOR_HANDOFF';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('prepare_handoff', userId, null, doc.toObject(), 'Handoff package prepared (non-executable)')].slice(-100);
    await doc.save();
    return { campaign: doc.toObject(), handoff };
}

export async function lockCampaign(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.lock');
    const doc = await loadDraft(companyId, id);
    const action = String(payload.action || 'lock');
    if (action === 'unlock') {
        doc.locked = false;
        doc.lockedAt = null;
        doc.lockedBy = null;
        if (doc.status === 'LOCKED') doc.status = 'DRAFT';
    } else {
        doc.locked = true;
        doc.lockedAt = new Date();
        doc.lockedBy = userId;
        doc.status = 'LOCKED';
    }
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function cancelCampaign(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.create');
    const doc = await loadDraft(companyId, id);
    doc.status = 'CANCELLED';
    doc.handoffStatus = 'CANCELLED';
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('cancel', userId, null, doc.toObject(), payload.reason || 'Cancelled')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function getHistory(companyId, id) {
    const doc = await loadDraft(companyId, id);
    return { history: doc.history || [] };
}

export async function exportCampaign(companyId, id, query = {}, user = null) {
    requirePerm(user, 'data_extractor.marketing_intelligence.export');
    const settings = await getMarketingSettings(companyId);
    const doc = await loadDraft(companyId, id);
    const limit = Math.min(settings.maximumExportRows, Math.max(1, Number(query.limit) || settings.maximumExportRows));
    const recipients = await AiMarketingCampaignRecipient.find({
        companyId, campaignDraftId: id, isDeleted: { $ne: true },
        ...(query.includedOnly === 'false' ? {} : { included: true }),
    }).limit(limit).lean();
    const show = canSeeContactDetails(user);
    const payload = {
        generatedAt: new Date().toISOString(),
        campaign: {
            id: doc._id,
            name: doc.name,
            campaignType: doc.campaignType,
            channelDraftType: doc.channelDraftType,
            status: doc.status,
            audienceStats: doc.audienceStats,
            messageNotSent: doc.messageNotSent,
            handoffStatus: doc.handoffStatus,
        },
        recipients: show ? recipients : recipients.map(stripContactDetails),
        aggregateOnly: !show,
        rowLimit: limit,
    };
    assertNoSecrets(payload);
    return payload;
}

export async function markOutdatedIfNeeded(companyId, id, reasons = []) {
    const doc = await loadDraft(companyId, id);
    if (doc.locked) return doc.toObject();
    if (!reasons.length) return doc.toObject();
    doc.outdatedReasons = [...new Set([...(doc.outdatedReasons || []), ...reasons])];
    doc.status = 'OUTDATED';
    if (doc.handoffStatus === 'READY_FOR_HANDOFF') doc.handoffStatus = 'OUTDATED';
    await doc.save();
    return doc.toObject();
}

export async function audiencePreview(companyId, id, user = null) {
    requirePerm(user, 'data_extractor.marketing_intelligence.view');
    const doc = await loadDraft(companyId, id);
    const filters = validateAudienceFilters(doc.audienceFilters || {});
    const leadQuery = buildExtractedLeadQuery(companyId, filters);
    const candidateCount = await ExtractedLead.countDocuments(leadQuery);
    return {
        filterSummary: filters,
        filterFingerprint: doc.audienceFilterFingerprint,
        candidateCount,
        audienceStats: doc.audienceStats,
        status: doc.status,
    };
}
