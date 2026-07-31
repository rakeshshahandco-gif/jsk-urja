import { Lead } from '../../../models/lead.model.js';
import Customer from '../../../models/customer.model.js';
import { Supplier } from '../../../models/supplier.model.js';
import { createLead, updateLead } from '../../lead.service.js';
import customerService from '../../customer.service.js';
import { companyScopeAls } from '../../../utils/companyScopeContext.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertNoSecrets, normEmail, normPhone } from './normalize.util.js';
import { ENGINE_VERSION } from './constants.js';

async function withCompanyScope(companyId, fn) {
    return companyScopeAls.run({ companyId: String(companyId) }, fn);
}

export async function loadCrmEntity(companyId, entityType, entityId) {
    if (!entityId) return null;
    // Load by id then verify company scope (avoids ALS tenant-plugin double-filter quirks in tests/jobs).
    if (entityType === 'LEAD') {
        const doc = await Lead.findById(entityId).lean();
        if (!doc || String(doc.companyId || '') !== String(companyId)) {
            throw new ApiError(404, 'CRM Lead not found in company scope');
        }
        return doc;
    }
    if (entityType === 'CUSTOMER') {
        const doc = await Customer.findById(entityId).lean();
        if (!doc || doc.isDeleted || String(doc.companyId || '') !== String(companyId)) {
            throw new ApiError(404, 'CRM Customer not found in company scope');
        }
        return doc;
    }
    if (entityType === 'SUPPLIER') {
        const doc = await Supplier.findById(entityId).lean();
        if (!doc || doc.isDeleted || String(doc.companyId || '') !== String(companyId)) {
            throw new ApiError(404, 'CRM Supplier not found in company scope');
        }
        return doc;
    }
    throw new ApiError(400, 'Invalid CRM entity type');
}

function appendAlternateNote(existingNotes, label, value) {
    const notes = String(existingNotes || '');
    const line = `${label}: ${value}`;
    if (notes.toLowerCase().includes(String(value).toLowerCase())) return notes;
    return [notes, line].filter(Boolean).join('\n');
}

/**
 * Build CRM patch from field decisions. Never auto-overwrites without USE_EXTRACTED.
 * ADD_ALTERNATE appends to notes (Lead has no alt email fields).
 */
export function buildPatchFromDecisions({ entityType, comparisons = [], proposed = {} }) {
    const patch = {};
    const applied = {};
    const rejected = {};
    const alternates = {};

    for (const c of comparisons || []) {
        const decision = c.userDecision || 'PENDING';
        if (decision === 'KEEP_CRM' || decision === 'REJECT_SUGGESTION' || decision === 'DEFER' || decision === 'MARK_INVALID' || decision === 'PENDING') {
            if (decision !== 'PENDING') rejected[c.fieldKey] = c.suggestedValue;
            continue;
        }
        if (decision === 'USE_EXTRACTED' || decision === 'KEEP_BOTH') {
            if (c.crmField && c.crmField !== 'notes') {
                patch[c.crmField] = c.suggestedValue;
                applied[c.fieldKey] = c.suggestedValue;
            } else if (c.fieldKey === 'notes' || c.crmField === 'notes') {
                patch.notes = c.suggestedValue;
                applied.notes = c.suggestedValue;
            }
            if (decision === 'KEEP_BOTH' && c.crmCurrentValue && c.suggestedValue && c.crmCurrentValue !== c.suggestedValue) {
                const noteField = entityType === 'SUPPLIER' ? 'remarks' : 'notes';
                const base = patch[noteField] ?? proposed.notes ?? '';
                patch[noteField] = appendAlternateNote(base, `Previous ${c.fieldKey}`, c.crmCurrentValue);
                alternates[c.fieldKey] = c.suggestedValue;
            }
        } else if (decision === 'ADD_ALTERNATE') {
            const noteField = entityType === 'SUPPLIER' ? 'remarks' : 'notes';
            const label = c.fieldKey.includes('email') || c.fieldKey.includes('Email') ? 'Alternate email' : c.fieldKey.includes('phone') || c.fieldKey.includes('Mobile') ? 'Alternate phone' : `Alternate ${c.fieldKey}`;
            const currentNotes = patch[noteField] ?? '';
            // dedupe
            if (String(currentNotes).toLowerCase().includes(String(c.suggestedValue || '').toLowerCase())) {
                rejected[c.fieldKey] = 'duplicate_alternate_skipped';
            } else {
                patch[noteField] = appendAlternateNote(currentNotes || c.crmCurrentValue || '', label, c.suggestedValue);
                alternates[c.fieldKey] = c.suggestedValue;
                applied[`${c.fieldKey}_alternate`] = c.suggestedValue;
            }
        }
    }

    assertNoSecrets(patch);
    return { patch, applied, rejected, alternates };
}

export async function createCrmLeadFromDraft(companyId, userId, { proposed = {}, extractedLeadId = null, sourcePlatform = '', sourceUrl = '' } = {}) {
    assertNoSecrets(proposed);
    const body = {
        source: 'data_extractor',
        status: 'new',
        priority: proposed.priority || 'medium',
        customerName: proposed.customerName || '',
        customerMobile: proposed.customerMobile || '',
        customerEmail: proposed.customerEmail || '',
        businessCategory: proposed.businessCategory || '',
        notes: proposed.notes || '',
        companyId,
        extractorRef: {
            extractedLeadId: extractedLeadId || null,
            sourcePlatform: sourcePlatform || 'data_extractor',
            sourceUrl: sourceUrl || proposed.website || '',
            convertedAt: new Date(),
        },
    };
    const lead = await withCompanyScope(companyId, () => createLead(body, userId));
    // Ensure companyId persisted even if ALS was missing in createLead path
    if (!lead.companyId || String(lead.companyId) !== String(companyId)) {
        await Lead.updateOne({ _id: lead._id }, { $set: { companyId } });
        lead.companyId = companyId;
    }
    return lead;
}

export async function applyCrmEnrichment(companyId, userId, {
    entityType,
    entityId,
    patch = {},
    user = null,
    settings = null,
} = {}) {
    assertNoSecrets(patch);
    if (!Object.keys(patch).length) {
        return { entity: await loadCrmEntity(companyId, entityType, entityId), applied: false };
    }

    if (entityType === 'LEAD') {
        const before = await loadCrmEntity(companyId, entityType, entityId);
        const updated = await withCompanyScope(companyId, () => updateLead(entityId, patch, userId, null, null));
        return { entity: updated?.toObject?.() || updated, before, applied: true };
    }
    if (entityType === 'CUSTOMER') {
        const before = await loadCrmEntity(companyId, entityType, entityId);
        const updated = await customerService.updateCustomerById(entityId, { ...patch, updatedBy: userId });
        // verify company scope
        if (updated && String(updated.companyId) !== String(companyId)) {
            throw new ApiError(403, 'Cross-company customer update blocked');
        }
        return { entity: updated, before, applied: true };
    }
    if (entityType === 'SUPPLIER') {
        const before = await loadCrmEntity(companyId, entityType, entityId);
        if (String(before.companyId) !== String(companyId)) throw new ApiError(403, 'Cross-company supplier update blocked');
        const updated = await Supplier.findOneAndUpdate(
            { _id: entityId, companyId },
            { $set: { ...patch, updatedBy: userId } },
            { new: true },
        );
        return { entity: updated?.toObject?.() || updated, before, applied: true };
    }
    throw new ApiError(400, 'Invalid entity type for enrichment');
}

export async function findExistingLeadByExtractorRef(companyId, extractedLeadId) {
    if (!extractedLeadId) return null;
    return Lead.findOne({ companyId, 'extractorRef.extractedLeadId': extractedLeadId }).lean();
}

export function engineMeta() {
    return { engineVersion: ENGINE_VERSION, noAutoCustomerCreate: true, noAutoSupplierCreate: true, noAutoTaskCreate: true, noAutoCommunications: true };
}

export function emailsEqual(a, b) {
    return normEmail(a) && normEmail(a) === normEmail(b);
}

export function phonesEqual(a, b) {
    return normPhone(a) && normPhone(a) === normPhone(b);
}
