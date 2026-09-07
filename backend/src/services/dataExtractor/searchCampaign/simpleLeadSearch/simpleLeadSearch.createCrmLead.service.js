/**
 * One-click CRM Lead from Simple Lead Search captured / enriched / verified rows.
 * Reuses existing lead.service.createLead. Does not create a parallel Lead system.
 * Extraction is not paused or stopped by this path.
 */
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification } from '../../../../models/rawCaptureQualification.model.js';
import { RawCaptureGenuineness } from '../../../../models/rawCaptureGenuineness.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { Lead } from '../../../../models/lead.model.js';
import Customer from '../../../../models/customer.model.js';
import { createLead } from '../../../lead.service.js';
import { getLeadVisibilityMeta } from '../../../lead.service.js';
import { getCompanyFeatureSettings } from '../../../companyFeatureSettings.service.js';
import { companyScopeAls } from '../../../../utils/companyScopeContext.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { userCanAssignLead } from '../../../../utils/leadVisibility.js';
import { assertAssistedCaptureView, assertAssistedCaptureStart } from '../assistedCapture/permissions.util.js';
import { CRM_CREATE_LEAD_PERM } from '../../crmEnrichment/constants.js';
import {
    buildAiVerificationDisplay,
    CRM_STATUS,
    safeHttpUrl,
    buildWhatsAppUrl,
} from './aiVerificationDisplay.util.js';

const CRM_ENUM = ['not_in_crm', 'lead_created', 'existing_lead', 'existing_customer'];

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function firstPhone(list, kinds = null) {
    if (!Array.isArray(list) || !list.length) return { value: '', sourceUrl: '', kind: '', labelledWhatsApp: false };
    const items = kinds
        ? list.filter((p) => kinds.includes(p?.kind))
        : list;
    const p = (items[0] || list[0]);
    if (typeof p === 'string') return { value: p, sourceUrl: '', kind: '', labelledWhatsApp: false };
    return {
        value: p?.normalized || p?.original || p?.value || '',
        sourceUrl: p?.sourceUrl || '',
        kind: p?.kind || '',
        labelledWhatsApp: Boolean(p?.labelledWhatsApp),
    };
}

function firstEmail(list) {
    if (!Array.isArray(list) || !list.length) return { value: '', sourceUrl: '' };
    const e = list[0];
    if (typeof e === 'string') return { value: e, sourceUrl: '' };
    return { value: e?.value || e?.address || '', sourceUrl: e?.sourceUrl || '' };
}

function socialUrl(obj) {
    if (!obj || typeof obj !== 'object') return '';
    return obj.url || '';
}

function domainFromWebsite(website) {
    try {
        const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

function phoneTail(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 8 ? d.slice(-10) : '';
}

function mapPriority(raw) {
    const s = String(raw || '').toLowerCase();
    if (s === 'hot' || s === 'high') return 'high';
    if (s === 'warm' || s === 'medium') return 'medium';
    if (s === 'normal' || s === 'low') return 'low';
    return 'medium';
}

function priorityLabel(p) {
    if (p === 'high') return 'Hot';
    if (p === 'low') return 'Normal';
    return 'Warm';
}

function normalizeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(pvt|private|ltd|limited|llc|inc|llp|co|company|industries|industry)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function assertCanCreateLead(user) {
    assertAssistedCaptureStart(user);
    if (!checkUserPermission(user, CRM_CREATE_LEAD_PERM)) {
        throw new ApiError(403, `Permission denied: ${CRM_CREATE_LEAD_PERM} required`);
    }
}

async function loadSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

async function resolveBundle({ companyId, session, captureId, genuinenessId, qualificationId, enrichmentId }) {
    let capture = null;
    let enrichment = null;
    let qualification = null;
    let genuineness = null;

    if (captureId && mongoose.isValidObjectId(captureId)) {
        capture = await RawCapture.findOne({
            _id: captureId, companyId, campaignId: session.campaignId,
        }).lean();
    }
    if (!capture && genuinenessId && mongoose.isValidObjectId(genuinenessId)) {
        genuineness = await RawCaptureGenuineness.findOne({
            _id: genuinenessId, companyId, campaignId: session.campaignId,
        }).lean();
        if (genuineness?.enrichmentId) {
            enrichment = await RawCaptureEnrichment.findOne({
                _id: genuineness.enrichmentId, companyId,
            }).lean();
        }
        if (genuineness?.qualificationId) {
            qualification = await RawCaptureQualification.findOne({
                _id: genuineness.qualificationId, companyId,
            }).lean();
        }
    }
    if (!qualification && qualificationId && mongoose.isValidObjectId(qualificationId)) {
        qualification = await RawCaptureQualification.findOne({
            _id: qualificationId, companyId, campaignId: session.campaignId,
        }).lean();
        if (qualification?.enrichmentId) {
            enrichment = enrichment || await RawCaptureEnrichment.findOne({
                _id: qualification.enrichmentId, companyId,
            }).lean();
        }
    }
    if (!enrichment && enrichmentId && mongoose.isValidObjectId(enrichmentId)) {
        enrichment = await RawCaptureEnrichment.findOne({
            _id: enrichmentId, companyId, campaignId: session.campaignId,
        }).lean();
    }
    if (!capture && enrichment?.rawCaptureIds?.length) {
        capture = await RawCapture.findOne({
            _id: enrichment.rawCaptureIds[0], companyId, campaignId: session.campaignId,
        }).lean();
    }
    if (!capture) throw new ApiError(404, 'Captured company not found');

    if (!enrichment) {
        enrichment = await RawCaptureEnrichment.findOne({
            companyId,
            campaignId: session.campaignId,
            rawCaptureIds: capture._id,
        }).lean();
    }
    if (!qualification && enrichment) {
        qualification = await RawCaptureQualification.findOne({
            companyId, enrichmentId: enrichment._id,
        }).lean();
    }
    if (!genuineness && qualification) {
        genuineness = await RawCaptureGenuineness.findOne({
            companyId, qualificationId: qualification._id,
        }).lean();
    }

    const campaign = await SearchCampaign.findById(session.campaignId)
        .select('name targetIndustry city state country')
        .lean();
    return { capture, enrichment, qualification, genuineness, campaign };
}

function buildCompanyDraft({ capture, enrichment, qualification, genuineness, campaign, session }) {
    const addr = Array.isArray(enrichment?.addresses) && enrichment.addresses[0] ? enrichment.addresses[0] : {};
    const contact = Array.isArray(enrichment?.contactPersons) && enrichment.contactPersons[0] ? enrichment.contactPersons[0] : {};
    const mobile = firstPhone(enrichment?.phones, ['mobile', 'whatsapp']);
    const tel = firstPhone(enrichment?.phones, ['general', 'toll_free']);
    const anyPhone = firstPhone(enrichment?.phones);
    const wa = firstPhone(enrichment?.whatsappNumbers);
    const email = firstEmail(enrichment?.emails);
    const website = enrichment?.websiteUrl || capture.resultUrlOriginal || capture.resultUrlNormalized || '';
    const companyName = enrichment?.canonicalCompanyName || enrichment?.companyName
        || enrichment?.legalOrDisplayedName || capture.title || '';
    const country = enrichment?.country || addr.country || campaign?.country || '';
    const waNumber = wa.value || (mobile.labelledWhatsApp ? mobile.value : '');
    const row = {
        companyName,
        title: capture.title,
        website,
        displayDomain: enrichment?.canonicalDomain || capture.displayDomain || '',
        phone: mobile.value || anyPhone.value,
        mobile: mobile.value || anyPhone.value,
        telephone: tel.value && tel.value !== (mobile.value || anyPhone.value) ? tel.value : '',
        email: email.value,
        facebook: socialUrl(enrichment?.facebook),
        instagram: socialUrl(enrichment?.instagram),
        linkedin: socialUrl(enrichment?.linkedin),
        youtube: socialUrl(enrichment?.youtube),
        primaryAddress: addr.raw || '',
        city: enrichment?.city || addr.city || '',
        state: enrichment?.state || addr.state || '',
        country,
        productsServices: Array.isArray(enrichment?.productsServices) ? enrichment.productsServices.join('; ') : '',
        businessType: qualification?.ownerBusinessTypeOverride || qualification?.businessType || enrichment?.businessType || '',
        searchKeyword: campaign?.targetIndustry || '',
        genuinenessStatus: genuineness?.ownerDecision || genuineness?.systemDecision || '',
        genuinenessScore: genuineness?.genuinenessScore,
        relevanceScore: qualification?.relevanceScore,
        businessTypeMatch: qualification?.businessTypeMatch || '',
        productMatchStrength: qualification?.productMatchStrength || '',
        manufacturerEvidence: genuineness?.manufacturerEvidence || enrichment?.manufacturerEvidence || '',
        locationMatch: qualification?.locationMatch || '',
        officeInSelectedCity: Boolean(qualification?.officeInSelectedCity),
        flags: {
            hasVerified: Boolean(genuineness && genuineness.verificationStatus !== 'failed'
                && ['verified_genuine', 'likely_genuine'].includes(genuineness.systemDecision)),
            hasQualified: Boolean(qualification),
            isDirectoryListing: Boolean(enrichment?.isDirectorySource)
                || genuineness?.systemDecision === 'directory_or_marketplace_only',
            isReview: genuineness?.systemDecision === 'human_review_required',
        },
        phoneSourceUrl: mobile.sourceUrl || anyPhone.sourceUrl,
        instagramMatch: enrichment?.instagram?.matchConfidence || '',
        conflictingEvidence: genuineness?.conflictingEvidence || enrichment?.conflictingValues || [],
    };
    const ai = buildAiVerificationDisplay(row);
    const googleUrl = enrichment?.directoryPlatform && /google|maps/i.test(String(enrichment.directoryPlatform))
        ? (enrichment.directoryProfileUrl || '')
        : '';
    return {
        captureId: String(capture._id),
        enrichmentId: enrichment?._id ? String(enrichment._id) : '',
        qualificationId: qualification?._id ? String(qualification._id) : '',
        genuinenessId: genuineness?._id ? String(genuineness._id) : '',
        campaignId: String(session.campaignId),
        sessionId: String(session._id),
        companyName,
        contactPerson: contact.name || '',
        mobile: row.mobile,
        telephone: row.telephone,
        email: row.email,
        website: safeHttpUrl(website),
        address: addr.raw || '',
        city: row.city,
        state: row.state,
        country,
        pincode: addr.pinCode || enrichment?.pinCode || '',
        industry: campaign?.targetIndustry || '',
        subIndustry: row.businessType || '',
        businessType: row.businessType,
        productsServices: row.productsServices,
        description: capture.snippet || '',
        facebook: safeHttpUrl(row.facebook),
        instagram: safeHttpUrl(row.instagram),
        linkedin: safeHttpUrl(row.linkedin),
        youtube: safeHttpUrl(row.youtube),
        googleBusinessUrl: safeHttpUrl(googleUrl),
        gstin: enrichment?.gstin || '',
        whatsapp: waNumber,
        whatsappUrl: buildWhatsAppUrl(waNumber || row.mobile, {
            labelled: Boolean(wa.value || mobile.labelledWhatsApp),
            country,
        }),
        sourceUrls: [
            safeHttpUrl(website),
            safeHttpUrl(capture.resultUrlOriginal),
            ...(Array.isArray(genuineness?.evidenceUrls) ? genuineness.evidenceUrls.map(safeHttpUrl) : []),
        ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 12),
        firstDiscoveredAt: capture.firstSeenAt || capture.createdAt || null,
        lastCheckedAt: genuineness?.verifiedAt || enrichment?.lastEnrichedAt || capture.lastSeenAt || null,
        fieldProvenance: {
            mobile: mobile.sourceUrl ? 'official website / extracted page' : (row.mobile ? 'public source' : ''),
            email: email.sourceUrl ? 'official website / extracted page' : (row.email ? 'public source' : ''),
            facebook: enrichment?.facebook?.sourceUrl ? 'website social link' : '',
            instagram: enrichment?.instagram?.sourceUrl ? 'website social link' : '',
            linkedin: enrichment?.linkedin?.sourceUrl ? 'website social link' : '',
        },
        storedCrmStatus: capture.crmStatus || 'not_in_crm',
        storedCrmLeadId: capture.crmLeadId ? String(capture.crmLeadId) : '',
        storedCrmCustomerId: capture.crmCustomerId ? String(capture.crmCustomerId) : '',
        ...ai,
    };
}

async function findCrmDuplicates(companyId, draft) {
    const orLead = [];
    const orCustomer = [];
    const email = String(draft.email || '').trim().toLowerCase();
    const tail = phoneTail(draft.mobile || draft.telephone);
    const domain = domainFromWebsite(draft.website);
    const gstin = String(draft.gstin || '').trim().toUpperCase();
    const nameKey = normalizeName(draft.companyName);

    if (draft.storedCrmLeadId && mongoose.isValidObjectId(draft.storedCrmLeadId)) {
        const lead = await Lead.findOne({ _id: draft.storedCrmLeadId, companyId })
            .select('_id customerName assignedToName priority')
            .lean();
        if (lead) {
            return {
                crmStatus: CRM_STATUS.LEAD_CREATED,
                existingLead: { _id: String(lead._id), customerName: lead.customerName, assignedToName: lead.assignedToName, priority: lead.priority },
                existingCustomer: null,
                matchField: 'stored_ref',
            };
        }
    }
    if (draft.storedCrmCustomerId && mongoose.isValidObjectId(draft.storedCrmCustomerId)) {
        const customer = await Customer.findOne({ _id: draft.storedCrmCustomerId, companyId, isDeleted: { $ne: true } })
            .select('_id customerName')
            .lean();
        if (customer) {
            return {
                crmStatus: CRM_STATUS.EXISTING_CUSTOMER,
                existingLead: null,
                existingCustomer: { _id: String(customer._id), customerName: customer.customerName },
                matchField: 'stored_ref',
            };
        }
    }

    if (email) {
        orLead.push({ customerEmail: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        orCustomer.push({ companyEmail: email }, { 'contactPersons.email': email });
    }
    if (tail) {
        orLead.push({ customerMobile: new RegExp(`${tail}$`) });
        orCustomer.push({ 'contactPersons.mobile': new RegExp(`${tail}$`) });
    }
    if (gstin) {
        orCustomer.push({ gstNumber: gstin }, { 'gstRegistrationHistory.gstin': gstin });
    }

    const [leads, customers, extractorLeads] = await Promise.all([
        orLead.length
            ? Lead.find({ companyId, $or: orLead }).select('_id customerName assignedToName priority customerEmail customerMobile extractorRef').limit(8).lean()
            : [],
        orCustomer.length
            ? Customer.find({ companyId, isDeleted: { $ne: true }, $or: orCustomer }).select('_id customerName website companyEmail gstin').limit(8).lean()
            : [],
        Lead.find({
            'extractorRef.rawCaptureId': mongoose.isValidObjectId(draft.captureId)
                ? draft.captureId
                : null,
            $or: [{ companyId }, { companyId: null }],
        }).select('_id customerName assignedToName priority').limit(3).lean(),
    ]);

    if (extractorLeads[0]) {
        return {
            crmStatus: CRM_STATUS.LEAD_CREATED,
            existingLead: {
                _id: String(extractorLeads[0]._id),
                customerName: extractorLeads[0].customerName,
                assignedToName: extractorLeads[0].assignedToName,
                priority: extractorLeads[0].priority,
            },
            existingCustomer: null,
            matchField: 'extractor_ref',
        };
    }

    let domainCustomer = null;
    if (domain) {
        const allCust = customers.length ? customers : await Customer.find({
            companyId,
            isDeleted: { $ne: true },
            website: { $regex: domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
        }).select('_id customerName website').limit(5).lean();
        domainCustomer = allCust.find((c) => domainFromWebsite(c.website) === domain) || null;
    }

    if (customers[0] || domainCustomer) {
        const c = customers[0] || domainCustomer;
        return {
            crmStatus: CRM_STATUS.EXISTING_CUSTOMER,
            existingLead: null,
            existingCustomer: { _id: String(c._id), customerName: c.customerName },
            matchField: customers[0] ? 'contact' : 'domain',
        };
    }

    if (leads[0]) {
        return {
            crmStatus: CRM_STATUS.EXISTING_LEAD,
            existingLead: {
                _id: String(leads[0]._id),
                customerName: leads[0].customerName,
                assignedToName: leads[0].assignedToName,
                priority: leads[0].priority,
            },
            existingCustomer: null,
            matchField: 'contact',
        };
    }

    if (nameKey && nameKey.length >= 4) {
        const nameLead = await Lead.findOne({
            companyId,
            customerName: new RegExp(`^${String(draft.companyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        }).select('_id customerName assignedToName priority').lean();
        if (nameLead && normalizeName(nameLead.customerName) === nameKey) {
            return {
                crmStatus: CRM_STATUS.EXISTING_LEAD,
                existingLead: {
                    _id: String(nameLead._id),
                    customerName: nameLead.customerName,
                    assignedToName: nameLead.assignedToName,
                    priority: nameLead.priority,
                },
                existingCustomer: null,
                matchField: 'company_name',
            };
        }
        const nameCust = await Customer.findOne({
            companyId,
            isDeleted: { $ne: true },
            customerName: new RegExp(`^${String(draft.companyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        }).select('_id customerName').lean();
        if (nameCust && normalizeName(nameCust.customerName) === nameKey) {
            return {
                crmStatus: CRM_STATUS.EXISTING_CUSTOMER,
                existingLead: null,
                existingCustomer: { _id: String(nameCust._id), customerName: nameCust.customerName },
                matchField: 'company_name',
            };
        }
    }

    return {
        crmStatus: CRM_STATUS.NOT_IN_CRM,
        existingLead: null,
        existingCustomer: null,
        matchField: '',
    };
}

async function persistCaptureCrmLink({ companyId, campaignId, capture, enrichment, leadId, customerId, status }) {
    const ids = new Set([String(capture._id)]);
    for (const id of (enrichment?.rawCaptureIds || [])) ids.add(String(id));
    const valid = [...ids].filter((id) => mongoose.isValidObjectId(id));
    const patch = {
        crmStatus: CRM_ENUM.includes(status) ? status : 'lead_created',
        crmLeadId: leadId || null,
        crmCustomerId: customerId || null,
    };
    if (!valid.length) return;
    await RawCapture.updateMany(
        { _id: { $in: valid }, companyId, campaignId },
        { $set: patch },
    );
}

export async function previewCrmLeadFromCapture({
    companyId, user, sessionId, captureId, genuinenessId, qualificationId, enrichmentId,
}) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    const session = await loadSession(cid, sessionId);
    const bundle = await resolveBundle({
        companyId: cid, session, captureId, genuinenessId, qualificationId, enrichmentId,
    });
    const draft = buildCompanyDraft({ ...bundle, session });
    const dup = await findCrmDuplicates(cid, draft);
    const settings = await getCompanyFeatureSettings(cid);
    const visibility = await getLeadVisibilityMeta(user, settings);
    return {
        createCrmLeadEnabled: checkUserPermission(user, CRM_CREATE_LEAD_PERM),
        campaignRunning: ['queued', 'agent_assigned', 'opening', 'awaiting_user', 'ready_to_capture', 'capturing', 'manual_action_required'].includes(session.status),
        draft: {
            companyName: draft.companyName,
            contactPerson: draft.contactPerson,
            mobile: draft.mobile,
            email: draft.email,
            website: draft.website,
            address: draft.address,
            city: draft.city,
            state: draft.state,
            industry: draft.industry,
            subIndustry: draft.subIndustry,
            productsServices: draft.productsServices,
            leadSource: 'Data Extractor',
            campaignId: draft.campaignId,
            captureId: draft.captureId,
            aiScore: draft.confidencePercent,
            verificationStatus: draft.aiStatus,
            suggestedProducts: draft.suggestedProducts,
        },
        company: draft,
        crmStatus: dup.crmStatus,
        existingLead: dup.existingLead,
        existingCustomer: dup.existingCustomer,
        matchField: dup.matchField,
        assignableUsers: visibility.canAssign ? visibility.users : [],
        canAssign: visibility.canAssign,
        canCreate: checkUserPermission(user, CRM_CREATE_LEAD_PERM) && dup.crmStatus === CRM_STATUS.NOT_IN_CRM,
        aiVerificationTooltip: draft.aiVerificationTooltip,
    };
}

export async function createCrmLeadFromCapture({
    companyId, user, sessionId, captureId, genuinenessId, qualificationId, enrichmentId, body = {},
}) {
    const cid = requireCompanyId(companyId);
    assertCanCreateLead(user);
    const session = await loadSession(cid, sessionId);
    const bundle = await resolveBundle({
        companyId: cid, session, captureId, genuinenessId, qualificationId, enrichmentId,
    });
    const draft = buildCompanyDraft({ ...bundle, session });
    const dup = await findCrmDuplicates(cid, draft);
    if (dup.crmStatus === CRM_STATUS.EXISTING_CUSTOMER) {
        await persistCaptureCrmLink({
            companyId: cid,
            campaignId: session.campaignId,
            capture: bundle.capture,
            enrichment: bundle.enrichment,
            customerId: dup.existingCustomer._id,
            status: 'existing_customer',
        });
        throw new ApiError(409, 'Existing Customer — duplicate Lead was not created');
    }
    if (dup.crmStatus === CRM_STATUS.EXISTING_LEAD || dup.crmStatus === CRM_STATUS.LEAD_CREATED) {
        await persistCaptureCrmLink({
            companyId: cid,
            campaignId: session.campaignId,
            capture: bundle.capture,
            enrichment: bundle.enrichment,
            leadId: dup.existingLead._id,
            status: dup.crmStatus === CRM_STATUS.LEAD_CREATED ? 'lead_created' : 'existing_lead',
        });
        throw new ApiError(409, 'Existing Lead — duplicate Lead was not created');
    }

    const uid = actorId(user);
    let assignedTo = body.assignedTo || body.assignedToUserId || null;
    if (assignedTo && !userCanAssignLead(user)) {
        assignedTo = uid;
    }
    if (assignedTo && !mongoose.isValidObjectId(assignedTo)) assignedTo = uid;

    const priority = mapPriority(body.priority);
    const remarks = String(body.remarks || body.notes || '').trim();
    const notes = [
        remarks,
        draft.description ? `Description: ${draft.description}` : '',
        draft.website ? `Website: ${draft.website}` : '',
        draft.address ? `Address: ${draft.address}` : '',
        draft.productsServices ? `Products / Services: ${draft.productsServices}` : '',
        `Lead Source: Data Extractor`,
        draft.aiStatus ? `AI verification: ${draft.aiStatus} (${draft.confidencePercent}%)` : '',
        draft.businessPotentialLabel ? `Business potential: ${draft.businessPotentialLabel} ${draft.businessPotentialScore}/100` : '',
        draft.suggestedProducts.length ? `Suggested opportunities: ${draft.suggestedProducts.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const payload = {
        source: 'data_extractor',
        status: 'new',
        priority,
        customerName: draft.companyName,
        customerMobile: draft.mobile || '',
        customerEmail: draft.email || '',
        businessCategory: draft.businessType || '',
        industry: draft.industry || '',
        subIndustry: draft.subIndustry || '',
        notes,
        assignedTo: assignedTo || uid,
        nextFollowUpDate: body.nextFollowUpDate || body.followUpDate || null,
        extractorRef: {
            extractedLeadId: null,
            sourcePlatform: 'data_extractor',
            sourceUrl: draft.website || bundle.capture.resultUrlOriginal || '',
            convertedAt: new Date(),
            campaignId: session.campaignId,
            sessionId: session._id,
            rawCaptureId: bundle.capture._id,
            enrichmentId: bundle.enrichment?._id || null,
            qualificationId: bundle.qualification?._id || null,
            genuinenessId: bundle.genuineness?._id || null,
            aiScore: draft.confidencePercent,
            verificationStatus: draft.aiStatus,
        },
    };

    const lead = await companyScopeAls.run({ companyId: String(cid) }, () => createLead(payload, uid));
    await Lead.updateOne({ _id: lead._id }, { $set: { companyId: cid } });
    lead.companyId = cid;

    await persistCaptureCrmLink({
        companyId: cid,
        campaignId: session.campaignId,
        capture: bundle.capture,
        enrichment: bundle.enrichment,
        leadId: lead._id,
        status: 'lead_created',
    });

    const assignedName = lead.assignedToName || '';
    return {
        created: true,
        extractionContinues: true,
        crmStatus: CRM_STATUS.LEAD_CREATED,
        lead: {
            _id: String(lead._id),
            customerName: lead.customerName,
            assignedTo: lead.assignedTo ? String(lead.assignedTo) : '',
            assignedToName: assignedName,
            priority: lead.priority,
            priorityLabel: priorityLabel(lead.priority),
        },
        message: 'LEAD CREATED SUCCESSFULLY',
    };
}

export { findCrmDuplicates, buildCompanyDraft, CRM_ENUM };
