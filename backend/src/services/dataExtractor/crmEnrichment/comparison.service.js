import { normText, normEmail, normPhone, normDomain } from './normalize.util.js';
import { SAFE_LEAD_FIELDS, SAFE_CUSTOMER_FIELDS, SAFE_SUPPLIER_FIELDS } from './constants.js';

function changeTypeFor(crmVal, suggested, { isAddress = false } = {}) {
    const a = crmVal == null || crmVal === '' ? '' : String(crmVal).trim();
    const b = suggested == null || suggested === '' ? '' : String(suggested).trim();
    if (!b) return 'INVALID_SOURCE';
    if (!a) return 'NEW_VALUE';
    if (normText(a) === normText(b) || normEmail(a) === normEmail(b) || normPhone(a) === normPhone(b) || normDomain(a) === normDomain(b)) {
        if (a === b) return 'SAME_VALUE';
        return 'FORMAT_ONLY';
    }
    if (isAddress && a.length > b.length * 1.2) return 'LESS_COMPLETE';
    if (b.length > a.length * 1.2) return 'MORE_COMPLETE';
    return 'CONFLICT';
}

function recommendedFor(changeType, fieldKey) {
    if (changeType === 'SAME_VALUE' || changeType === 'FORMAT_ONLY') return 'KEEP_CRM';
    if (changeType === 'NEW_VALUE') return 'USE_EXTRACTED';
    if (changeType === 'MORE_COMPLETE') return 'USE_EXTRACTED';
    if (changeType === 'LESS_COMPLETE') return 'KEEP_CRM';
    if (changeType === 'CONFLICT') {
        if (['customerEmail', 'companyEmail', 'email', 'customerMobile', 'phone'].includes(fieldKey)) return 'ADD_ALTERNATE';
        return 'DEFER';
    }
    return 'PENDING';
}

function row(fieldKey, crmField, crmCurrentValue, suggestedValue, meta = {}) {
    const changeType = changeTypeFor(crmCurrentValue, suggestedValue, { isAddress: fieldKey.includes('address') || fieldKey === 'address' });
    const conflictStatus = changeType === 'CONFLICT' ? 'CONFLICT' : changeType === 'LESS_COMPLETE' ? 'PROTECTED' : '';
    return {
        fieldKey,
        crmField,
        crmCurrentValue: crmCurrentValue ?? '',
        suggestedValue: suggestedValue ?? '',
        normalizedValue: suggestedValue ?? '',
        source: meta.source || 'data_extractor',
        sourceUrl: meta.sourceUrl || '',
        sourceTimestamp: meta.sourceTimestamp || null,
        verificationStatus: meta.verificationStatus || '',
        confidence: meta.confidence || 0,
        changeType,
        conflictStatus,
        recommendedAction: recommendedFor(changeType, fieldKey),
        userDecision: 'PENDING',
        appliedTimestamp: null,
        appliedBy: null,
        notes: meta.notes || '',
    };
}

export function buildProposedFieldsFromSource(source = {}, snapshots = {}) {
    const contact = snapshots.contact?.primaryContact || {};
    const classification = snapshots.classification || {};
    const score = snapshots.score || {};
    const recommendation = snapshots.recommendation || {};
    const profile = snapshots.profile || {};

    const proposed = {
        customerName: source.companyName || '',
        customerEmail: contact.email || source.email || '',
        customerMobile: contact.phone || source.mobile || source.phone || '',
        businessCategory: classification.parentIndustry || classification.subIndustry || '',
        website: source.website || '',
        address: source.address || '',
        city: source.city || '',
        state: source.stateProvince || source.state || '',
        pincode: source.pincode || '',
        country: source.country || 'India',
        notes: [
            profile?.structuredSections?.companyOverview?.description || source.businessDescription || '',
            recommendation?.primaryRecommendation?.productName
                ? `Recommended product: ${recommendation.primaryRecommendation.productName}`
                : '',
            Number.isFinite(Number(score.finalScore)) ? `Lead score: ${score.finalScore}` : '',
            contact.contactName ? `Contact: ${contact.contactName}${contact.designation ? ` (${contact.designation})` : ''}` : '',
            `Imported via Data Extractor CRM Enrichment`,
        ].filter(Boolean).join('\n'),
        priority: Number(score.finalScore) >= 70 ? 'high' : Number(score.finalScore) >= 40 ? 'medium' : 'low',
        source: 'data_extractor',
        contactPerson: contact.contactName || '',
        tradeName: source.companyName || '',
        company: source.companyName || '',
        supplierName: source.companyName || '',
        companyEmail: contact.email || source.email || '',
        phone: contact.phone || source.mobile || source.phone || '',
        remarks: source.businessDescription || '',
        alternateEmails: [],
        alternatePhones: [],
        customerType: classification.customerType || '',
        subIndustry: classification.subIndustry || '',
        mappingRequired: {
            industry: !classification.parentIndustry,
            customerType: !classification.customerType,
        },
    };
    return proposed;
}

export function buildFieldComparisons({ entityType = 'LEAD', crmEntity = null, proposed = {}, sourceMeta = {} } = {}) {
    const comparisons = [];
    const meta = {
        source: 'data_extractor',
        sourceUrl: sourceMeta.sourceUrl || '',
        sourceTimestamp: sourceMeta.sourceTimestamp || new Date(),
        confidence: sourceMeta.confidence || 60,
        verificationStatus: sourceMeta.verificationStatus || '',
    };

    if (!crmEntity) {
        // Create Lead Draft — all proposed as NEW
        for (const key of ['customerName', 'customerEmail', 'customerMobile', 'businessCategory', 'notes', 'priority']) {
            if (proposed[key] == null || proposed[key] === '') continue;
            comparisons.push(row(key, key, '', proposed[key], meta));
            comparisons[comparisons.length - 1].changeType = 'NEW_VALUE';
            comparisons[comparisons.length - 1].recommendedAction = 'USE_EXTRACTED';
        }
        return comparisons;
    }

    if (entityType === 'LEAD') {
        for (const key of SAFE_LEAD_FIELDS) {
            if (key === 'source') continue;
            comparisons.push(row(key, key, crmEntity[key], proposed[key], meta));
        }
        // Website / address go to notes metadata if no CRM field
        if (proposed.website && !String(crmEntity.notes || '').includes(proposed.website)) {
            comparisons.push(row('website_note', 'notes', crmEntity.notes || '', `${crmEntity.notes || ''}\nWebsite: ${proposed.website}`.trim(), {
                ...meta,
                notes: 'Website stored via notes — Lead schema has no website field',
            }));
        }
    } else if (entityType === 'CUSTOMER') {
        for (const key of SAFE_CUSTOMER_FIELDS) {
            comparisons.push(row(key, key, crmEntity[key], proposed[key === 'customerName' ? 'customerName' : key] ?? proposed[key], meta));
        }
    } else if (entityType === 'SUPPLIER') {
        for (const key of SAFE_SUPPLIER_FIELDS) {
            const suggested = key === 'supplierName' ? proposed.supplierName : key === 'remarks' ? proposed.remarks : proposed[key];
            comparisons.push(row(key, key, crmEntity[key], suggested, meta));
        }
    }

    // Address protection: complete CRM address vs partial
    const addr = comparisons.find((c) => c.fieldKey === 'address');
    if (addr && addr.crmCurrentValue && String(addr.crmCurrentValue).length > 20) {
        const sug = String(addr.suggestedValue || '');
        if (sug && sug.length < String(addr.crmCurrentValue).length * 0.6) {
            addr.changeType = 'LESS_COMPLETE';
            addr.conflictStatus = 'PROTECTED';
            addr.recommendedAction = 'KEEP_CRM';
            addr.notes = 'Complete CRM address not replaced with partial public address';
        }
    }

    return comparisons;
}

export function applyFieldDecisions(comparisons = [], decisions = {}) {
    return (comparisons || []).map((c) => {
        const d = decisions[c.fieldKey] || c.userDecision || 'PENDING';
        return { ...c, userDecision: d };
    });
}

export function conflictsFromComparisons(comparisons = []) {
    return (comparisons || []).filter((c) => c.changeType === 'CONFLICT' || c.conflictStatus === 'CONFLICT' || (c.userDecision === 'PENDING' && c.recommendedAction === 'DEFER'));
}
