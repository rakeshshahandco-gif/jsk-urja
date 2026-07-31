import { ENGINE_VERSION } from './constants.js';

function normalize(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s&/.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

export function matchRole(contact = {}, roles = []) {
    const hay = normalize([contact.designation, contact.department, contact.contactRoleCategory, contact.emailCategory, contact.email].filter(Boolean).join(' '));
    let best = null;
    let bestScore = -1;
    const signals = [];
    for (const role of roles || []) {
        if (role.isActive === false) continue;
        const neg = (role.negativeKeywords || []).map(normalize).filter((k) => k && hay.includes(k));
        if (neg.length) continue;
        const hits = (role.keywords || []).map(normalize).filter((k) => k && hay.includes(k));
        const nameHit = normalize(role.roleName) && hay.includes(normalize(role.roleName));
        const score = hits.length * 10 + (nameHit ? 15 : 0);
        if (score > bestScore) {
            bestScore = score;
            best = role;
            signals.splice(0, signals.length, ...hits, ...(nameHit ? [role.roleName] : []));
        }
    }
    if (!best) {
        if (contact.isGenericEmail || normalize(contact.emailCategory) === 'info') {
            best = roles.find((r) => normalize(r.roleName) === 'general contact') || { roleName: 'General Contact', seniorityWeight: 15, decisionMakerWeight: 15, roleGroup: 'General' };
            signals.push('generic_email');
        } else {
            best = roles.find((r) => normalize(r.roleName) === 'unknown') || { roleName: 'Unknown', seniorityWeight: 10, decisionMakerWeight: 10, roleGroup: 'General' };
        }
    }
    return { role: best, signals: uniq(signals) };
}

function opportunityBoost(role, opportunityType = '') {
    const opp = normalize(opportunityType);
    if (!opp) return 0;
    const types = (role.applicableOpportunityTypes || []).map(normalize);
    if (types.includes('all') || types.some((t) => opp.includes(t) || t.includes(opp))) return 18;
    const priorities = role.opportunityPriorities || [];
    for (const p of priorities) {
        if (normalize(p.opportunityType) && (opp.includes(normalize(p.opportunityType)) || normalize(p.opportunityType).includes(opp))) {
            return Math.max(0, 30 - Number(p.priorityRank || 50) / 5);
        }
    }
    // heuristic defaults from configurable role groups when mapping empty
    const group = normalize(role.roleGroup || role.roleName);
    if ((opp.includes('oem') || opp.includes('purchase') || opp.includes('procurement')) && (group.includes('procurement') || group.includes('purchase') || group.includes('sourcing'))) return 22;
    if ((opp.includes('technical') || opp.includes('r&d') || opp.includes('engineering')) && (group.includes('engineering') || group.includes('technical') || group.includes('r&d'))) return 22;
    if ((opp.includes('export') || opp.includes('distributor') || opp.includes('dealer') || opp.includes('sales')) && (group.includes('commercial') || group.includes('export') || group.includes('sales') || group.includes('channel'))) return 20;
    if (group.includes('leadership')) return 8;
    return 0;
}

export function scoreContact(contact, { roles = [], opportunityType = '', recommendation = null } = {}) {
    const reasons = [];
    const warnings = [...(contact.warnings || [])];
    const { role, signals } = matchRole(contact, roles);
    let score = 0;
    score += Number(role.decisionMakerWeight || 0) * 0.35;
    score += Number(role.seniorityWeight || 0) * 0.2;
    reasons.push({ rule: 'role_weights', detail: `Role ${role.roleName}`, delta: Math.round(Number(role.decisionMakerWeight || 0) * 0.35 + Number(role.seniorityWeight || 0) * 0.2) });

    const boost = opportunityBoost(role, opportunityType || recommendation?.recommendedSalesStrategy || recommendation?.primaryRecommendation?.salesStrategy || '');
    score += boost;
    if (boost) reasons.push({ rule: 'opportunity_fit', detail: `Opportunity relevance for ${role.roleName}`, delta: Math.round(boost) });

    if (contact.isNamedEmail) {
        score += 12;
        reasons.push({ rule: 'named_email', detail: 'Named business email preferred over generic', delta: 12 });
    } else if (contact.isGenericEmail) {
        score -= 8;
        reasons.push({ rule: 'generic_email_penalty', detail: 'Generic mailbox is fallback-only', delta: -8 });
    }
    if (contact.email) score += 8;
    if (contact.phone) score += 8;
    if (contact.profileUrl) score += 4;
    if (contact.designation) score += 6;
    if (contact.verificationStatus === 'MULTIPLE_SOURCE_CONFIRMED') {
        score += 12;
        reasons.push({ rule: 'multi_source', detail: 'Multiple-source confirmation', delta: 12 });
    } else if (contact.verificationStatus === 'SOURCE_VERIFIED' || contact.verificationStatus === 'MANUALLY_VERIFIED') {
        score += 10;
        reasons.push({ rule: 'verified', detail: contact.verificationStatus, delta: 10 });
    } else if (contact.verificationStatus === 'INFERRED_UNVERIFIED') {
        score -= 25;
        warnings.push('Inferred contact is unverified');
        reasons.push({ rule: 'inferred_penalty', detail: 'INFERRED_UNVERIFIED cannot be treated as verified', delta: -25 });
    } else if (contact.verificationStatus === 'INVALID') {
        score -= 40;
    }

    if (contact.isManuallyApproved) score += 15;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const quality = Math.max(0, Math.min(100, Math.round(
        (contact.email ? 25 : 0)
        + (contact.phone ? 25 : 0)
        + (contact.contactName && !contact.isGenericCompanyContact ? 20 : 0)
        + (contact.designation ? 15 : 0)
        + (contact.profileUrl ? 10 : 0)
        + (['SOURCE_VERIFIED', 'MULTIPLE_SOURCE_CONFIRMED', 'MANUALLY_VERIFIED'].includes(contact.verificationStatus) ? 5 : 0),
    )));

    const channels = [];
    if (contact.email) channels.push('email');
    if (contact.phone) channels.push('phone');
    if (contact.whatsappCapable) channels.push('whatsapp');
    if (contact.profileUrl) channels.push('profile');

    const isGeneric = !!(contact.isGenericEmail || contact.isGenericCompanyContact || normalize(role.roleName) === 'general contact');
    const isDecision = score >= 55 && !isGeneric && contact.verificationStatus !== 'INFERRED_UNVERIFIED';

    return {
        ...contact,
        contactRoleCategory: role.roleName || contact.contactRoleCategory || 'Unknown',
        department: contact.department || role.roleGroup || '',
        seniority: Number(role.seniorityWeight || 0) >= 85 ? 'Executive' : Number(role.seniorityWeight || 0) >= 65 ? 'Manager' : Number(role.seniorityWeight || 0) >= 40 ? 'Individual' : 'General',
        decisionMakerScore: score,
        contactQualityScore: quality,
        matchedRoleSignals: uniq([...(contact.matchedRoleSignals || []), ...signals]),
        opportunityRelevance: opportunityType || recommendation?.recommendedSalesStrategy || '',
        availableChannels: uniq(channels),
        isGenericCompanyContact: isGeneric,
        isDecisionMakerCandidate: isDecision,
        rankingReasons: reasons,
        whyRecommended: reasons.filter((r) => (r.delta || 0) > 0).slice(0, 4).map((r) => r.detail).join(' | ') || 'Limited contact signals',
        warnings,
        confidence: Math.round((Number(contact.confidence || 50) + score) / 2),
    };
}

export function rankContacts(contacts = [], context = {}) {
    const scored = (contacts || []).map((c) => scoreContact(c, context)).sort((a, b) => b.decisionMakerScore - a.decisionMakerScore);
    const named = scored.filter((c) => !c.isGenericCompanyContact && c.verificationStatus !== 'INFERRED_UNVERIFIED' && c.verificationStatus !== 'INVALID');
    const generic = scored.filter((c) => c.isGenericCompanyContact && c.verificationStatus !== 'INVALID');
    const inferred = scored.filter((c) => c.verificationStatus === 'INFERRED_UNVERIFIED');

    const primary = named[0] || null;
    const secondary = named.slice(1, 4);
    const genericFallback = generic[0] || null;

    let status = 'NO_PUBLIC_CONTACT';
    if (!scored.length) status = 'NO_PUBLIC_CONTACT';
    else if (primary && secondary.length) status = 'MULTIPLE_CONTACTS';
    else if (primary) status = 'CONTACT_FOUND';
    else if (genericFallback) status = 'GENERIC_CONTACT_ONLY';
    else if (inferred.length) status = 'LOW_CONFIDENCE';
    else status = 'MANUAL_REVIEW_REQUIRED';

    if (primary) primary.isPrimaryContact = true;

    return {
        status,
        contacts: scored,
        primaryContact: primary,
        secondaryContacts: secondary,
        genericFallbackContact: genericFallback,
        decisionMakerScore: primary?.decisionMakerScore || genericFallback?.decisionMakerScore || 0,
        contactQualityScore: primary?.contactQualityScore || genericFallback?.contactQualityScore || 0,
        confidence: primary?.confidence || genericFallback?.confidence || 0,
        whyRecommended: primary?.whyRecommended || genericFallback?.whyRecommended || 'No suitable public contact ranked',
        warnings: uniq(scored.flatMap((c) => c.warnings || [])),
        engineUsed: 'rule_based',
        modelVersion: ENGINE_VERSION,
        analysisTimestamp: new Date().toISOString(),
    };
}
