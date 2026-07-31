import { PURPOSE_ROLE_PRIORITY } from './constants.js';
import { isGenericEmail, isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from './normalize.util.js';

function roleText(contact = {}) {
    return String(contact.role || contact.designation || contact.title || contact.department || '').toLowerCase();
}

export function matchContactRole(campaignType, contact = {}) {
    const preferred = PURPOSE_ROLE_PRIORITY[campaignType] || PURPOSE_ROLE_PRIORITY.DEFAULT;
    const text = roleText(contact);
    if (!text) {
        if (isGenericEmail(contact.email)) return { level: 'GENERIC_CONTACT', why: 'generic_email_only' };
        return { level: 'MANUAL_REVIEW_REQUIRED', why: 'no_role_evidence' };
    }
    for (let i = 0; i < preferred.length; i += 1) {
        if (text.includes(preferred[i])) {
            return {
                level: i === 0 ? 'BEST_MATCH' : 'ACCEPTABLE_MATCH',
                why: `role_matches_${preferred[i]}`,
            };
        }
    }
    if (isGenericEmail(contact.email)) return { level: 'GENERIC_CONTACT', why: 'generic_email' };
    return { level: 'WEAK_MATCH', why: 'role_not_preferred' };
}

/**
 * Pick best public-business contact from Contact Intelligence snapshot / lead fields.
 */
export function selectContact({
    campaignType,
    contactIntel = null,
    extractedLead = null,
    crmLead = null,
    settings = {},
}) {
    const candidates = [];
    const contacts = Array.isArray(contactIntel?.contacts)
        ? contactIntel.contacts
        : (contactIntel?.primaryContact ? [contactIntel.primaryContact] : []);

    for (const c of contacts) {
        if (c?.isPrivate || c?.hidden) continue;
        candidates.push({
            contactName: c.name || c.contactName || '',
            role: c.role || c.designation || '',
            department: c.department || '',
            seniority: c.seniority || '',
            email: c.email || '',
            phone: c.phone || c.mobile || '',
            emailVerified: c.emailVerified === true || c.verificationStatus === 'VERIFIED',
            phoneVerified: c.phoneVerified === true || c.phoneVerificationStatus === 'VERIFIED',
            source: c.source || 'contact_intelligence',
            sourceUrl: c.sourceUrl || '',
            confidence: Number(c.confidence || contactIntel?.confidence || 0),
            isDecisionMaker: c.isDecisionMaker === true || /decision|owner|director/i.test(String(c.role || '')),
        });
    }

    if (!candidates.length && extractedLead) {
        candidates.push({
            contactName: extractedLead.contactName || extractedLead.personName || '',
            role: extractedLead.contactRole || '',
            department: '',
            seniority: '',
            email: extractedLead.email || extractedLead.companyEmail || '',
            phone: extractedLead.phone || extractedLead.mobile || '',
            emailVerified: false,
            phoneVerified: false,
            source: 'extracted_lead',
            sourceUrl: extractedLead.sourceUrl || '',
            confidence: Number(extractedLead.confidenceScore || 0),
            isDecisionMaker: false,
        });
    }

    if (!candidates.length && crmLead) {
        candidates.push({
            contactName: crmLead.customerName || '',
            role: '',
            department: '',
            seniority: '',
            email: crmLead.customerEmail || '',
            phone: crmLead.customerMobile || '',
            emailVerified: false,
            phoneVerified: false,
            source: 'crm_lead',
            sourceUrl: '',
            confidence: 0,
            isDecisionMaker: false,
        });
    }

    if (!candidates.length) {
        return {
            selected: null,
            roleMatch: { level: 'MANUAL_REVIEW_REQUIRED', why: 'no_contact' },
            alternatives: [],
        };
    }

    const scored = candidates.map((c) => {
        const match = matchContactRole(campaignType, c);
        let score = 0;
        if (match.level === 'BEST_MATCH') score += 50;
        else if (match.level === 'ACCEPTABLE_MATCH') score += 35;
        else if (match.level === 'GENERIC_CONTACT') score += settings.allowGenericContacts ? 10 : 0;
        else if (match.level === 'WEAK_MATCH') score += 5;
        if (c.isDecisionMaker) score += 15;
        if (isValidEmail(c.email)) score += 10;
        if (isValidPhone(c.phone)) score += 10;
        if (c.emailVerified) score += 8;
        if (c.phoneVerified) score += 8;
        score += Math.min(10, Number(c.confidence) || 0) / 10;
        return { contact: c, match, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    return {
        selected: {
            ...top.contact,
            normalizedEmail: normalizeEmail(top.contact.email),
            normalizedPhone: normalizePhone(top.contact.phone),
            whySelected: top.match.why,
        },
        roleMatch: top.match,
        alternatives: scored.slice(1, 4).map((s) => ({
            contactName: s.contact.contactName,
            role: s.contact.role,
            email: s.contact.email,
            phone: s.contact.phone,
            roleMatch: s.match.level,
        })),
    };
}
