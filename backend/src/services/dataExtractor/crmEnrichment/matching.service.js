import { Lead } from '../../../models/lead.model.js';
import Customer from '../../../models/customer.model.js';
import { Supplier } from '../../../models/supplier.model.js';
import { normText, normEmail, normPhone, normDomain, normGstin, isGenericEmail } from './normalize.util.js';

function companyNameTokens(name = '') {
    return new Set(normText(name).split(' ').filter((t) => t.length > 2 && !['pvt', 'ltd', 'limited', 'llp', 'private', 'company'].includes(t)));
}

function nameOnlySimilar(a, b) {
    const A = companyNameTokens(a);
    const B = companyNameTokens(b);
    if (!A.size || !B.size) return 0;
    const inter = [...A].filter((x) => B.has(x)).length;
    return inter / Math.max(A.size, B.size);
}

function scoreCandidate(source, entity, type) {
    const evidence = [];
    let score = 0;
    const srcEmail = normEmail(source.email || source.customerEmail);
    const entEmail = normEmail(entity.email || entity.customerEmail || entity.companyEmail);
    const srcPhone = normPhone(source.phone || source.mobile || source.customerMobile);
    const entPhone = normPhone(entity.phone || entity.mobile || entity.customerMobile || (entity.contactPersons?.[0]?.mobile));
    const srcDomain = normDomain(source.website || source.normalizedDomain);
    const entDomain = normDomain(entity.website || '');
    const srcGst = normGstin(source.gstin || source.rawExtractedData?.gstin);
    const entGst = normGstin(entity.gstNumber || entity.gstin);
    const srcName = source.companyName || source.customerName || '';
    const entName = entity.customerName || entity.company || entity.supplierName || entity.tradeName || '';

    if (srcGst && entGst && srcGst === entGst && srcGst.length >= 15) {
        score += 50;
        evidence.push({ signal: 'exact_gstin', weight: 50 });
    }
    if (srcDomain && entDomain && srcDomain === entDomain) {
        score += 40;
        evidence.push({ signal: 'exact_domain', weight: 40 });
    }
    if (srcEmail && entEmail && srcEmail === entEmail) {
        if (isGenericEmail(srcEmail)) {
            score += 8;
            evidence.push({ signal: 'generic_email_shared', weight: 8, caution: true });
        } else {
            score += 35;
            evidence.push({ signal: 'exact_email', weight: 35 });
        }
    }
    if (srcPhone && entPhone && srcPhone === entPhone) {
        score += 30;
        evidence.push({ signal: 'exact_phone', weight: 30 });
    }
    const nameRatio = nameOnlySimilar(srcName, entName);
    if (nameRatio >= 0.99) {
        score += 18;
        evidence.push({ signal: 'exact_normalized_name', weight: 18 });
    } else if (nameRatio >= 0.75) {
        score += 8;
        evidence.push({ signal: 'similar_name', weight: 8, caution: true });
    }

    const srcCity = normText(source.city);
    const entCity = normText(entity.city);
    if (srcCity && entCity && srcCity === entCity && nameRatio >= 0.6) {
        score += 10;
        evidence.push({ signal: 'name_plus_city', weight: 10 });
    } else if (nameRatio >= 0.75 && srcCity && entCity && srcCity !== entCity) {
        evidence.push({ signal: 'same_name_different_city', weight: 0, requireReview: true });
    }

    if (source.sourceUrl && entity.extractorRef?.sourceUrl && source.sourceUrl === entity.extractorRef.sourceUrl) {
        score += 15;
        evidence.push({ signal: 'same_source_url', weight: 15 });
    }

    // Name-only must not auto-link
    const onlyName = evidence.every((e) => e.signal === 'similar_name' || e.signal === 'exact_normalized_name' || e.signal === 'same_name_different_city' || e.requireReview);
    if (onlyName && score < 40) {
        return {
            entityType: type,
            entityId: entity._id,
            displayName: entName,
            score: Math.min(score, 25),
            evidence,
            nameOnly: true,
            differentCity: evidence.some((e) => e.signal === 'same_name_different_city'),
        };
    }

    return {
        entityType: type,
        entityId: entity._id,
        displayName: entName,
        score: Math.min(100, score),
        evidence,
        nameOnly: false,
        differentCity: evidence.some((e) => e.signal === 'same_name_different_city'),
        website: entity.website || '',
        email: entEmail,
        phone: entPhone,
        city: entity.city || '',
    };
}

function classifyMatches(candidates = []) {
    const strong = candidates.filter((c) => c.score >= 70 && !c.nameOnly);
    const possible = candidates.filter((c) => c.score >= 35 && c.score < 70);
    const review = candidates.filter((c) => c.differentCity || (c.nameOnly && c.score > 0));

    if (strong.length > 1) {
        return { matchStatus: 'MULTIPLE_MATCHES', matchScore: strong[0].score, top: strong[0], candidates: strong };
    }
    if (strong.length === 1 && strong[0].score >= 85 && strong[0].evidence.some((e) => ['exact_domain', 'exact_email', 'exact_gstin', 'exact_phone'].includes(e.signal) && !e.caution)) {
        return { matchStatus: 'EXACT_MATCH', matchScore: strong[0].score, top: strong[0], candidates: strong };
    }
    if (strong.length === 1) {
        return { matchStatus: 'STRONG_MATCH', matchScore: strong[0].score, top: strong[0], candidates: strong };
    }
    if (review.length && !strong.length) {
        return { matchStatus: 'MANUAL_REVIEW_REQUIRED', matchScore: review[0]?.score || 0, top: null, candidates: [...review, ...possible].slice(0, 10) };
    }
    if (possible.length > 1) {
        return { matchStatus: 'MULTIPLE_MATCHES', matchScore: possible[0].score, top: null, candidates: possible.slice(0, 10) };
    }
    if (possible.length === 1) {
        return { matchStatus: 'POSSIBLE_MATCH', matchScore: possible[0].score, top: possible[0], candidates: possible };
    }
    if (candidates.some((c) => c.evidence.some((e) => e.caution) && c.evidence.some((e) => e.signal === 'exact_domain' || e.signal === 'exact_email'))) {
        return { matchStatus: 'CONFLICTING_MATCH', matchScore: candidates[0]?.score || 0, top: null, candidates: candidates.slice(0, 10) };
    }
    return { matchStatus: 'NO_MATCH', matchScore: 0, top: null, candidates: [] };
}

/**
 * Company-scoped CRM matching. Never returns foreign-company records.
 * Name-alone never auto-matches.
 */
export async function matchAgainstCrm(companyId, source = {}) {
    const [leads, customers, suppliers] = await Promise.all([
        Lead.find({ companyId }).limit(500).lean(),
        Customer.find({ companyId, isDeleted: { $ne: true } }).limit(500).lean(),
        Supplier.find({ companyId, isDeleted: { $ne: true } }).limit(500).lean(),
    ]);

    const scored = [
        ...leads.map((e) => scoreCandidate(source, e, 'LEAD')),
        ...customers.map((e) => scoreCandidate(source, e, 'CUSTOMER')),
        ...suppliers.map((e) => scoreCandidate(source, e, 'SUPPLIER')),
    ].filter((c) => c.score > 0).sort((a, b) => b.score - a.score);

    const classified = classifyMatches(scored);
    return {
        ...classified,
        matchEvidence: classified.top?.evidence || classified.candidates[0]?.evidence || [],
        matchCandidates: classified.candidates,
        matchedCrmEntityType: classified.top?.entityType || 'NONE',
        matchedCrmEntityId: classified.top?.entityId || null,
    };
}

/** Pure helper for unit tests without DB */
export function scoreCrmCandidate(source, entity, type) {
    return scoreCandidate(source, entity, type);
}

export function classifyCrmMatches(candidates) {
    return classifyMatches(candidates);
}
