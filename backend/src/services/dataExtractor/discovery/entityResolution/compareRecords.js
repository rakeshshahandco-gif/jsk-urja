import {
    collectRecordKeys,
    stringSimilarity,
    tokenJaccard,
} from './matchUtils.js';
import { decideFromScoreAndReasons } from './decisionLevels.js';

const LOCATION_HINTS = new Set([
    'mumbai', 'delhi', 'chennai', 'kolkata', 'pune', 'bengaluru', 'bangalore', 'hyderabad', 'ahmedabad',
    'surat', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'indore', 'thane', 'bhopal', 'visakhapatnam',
    'patna', 'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik', 'faridabad', 'meerut', 'rajkot',
]);

function companyTokens(record) {
    return String(record?.companyName || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function stripLegalSuffixes(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|co|company)\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectRelationshipHints(a, b, ka, kb) {
    const hints = [];
    const rawA = String(a.companyName || '').trim();
    const rawB = String(b.companyName || '').trim();
    if (!rawA || !rawB) return hints;

    const coreA = stripLegalSuffixes(rawA);
    const coreB = stripLegalSuffixes(rawB);
    const coreSim = stringSimilarity(coreA.replace(/\s+/g, ''), coreB.replace(/\s+/g, ''));
    const tokensA = companyTokens(a);
    const tokensB = companyTokens(b);
    const prefixA = tokensA.slice(0, -1).join(' ');
    const prefixB = tokensB.slice(0, -1).join(' ');
    const lastA = tokensA[tokensA.length - 1] || '';
    const lastB = tokensB[tokensB.length - 1] || '';

    const looksBranchVariant = tokensA.length >= 3
        && tokensB.length >= 3
        && prefixA
        && prefixA === prefixB
        && lastA
        && lastB
        && lastA !== lastB
        && (LOCATION_HINTS.has(lastA) || LOCATION_HINTS.has(lastB) || lastA === ka.city || lastB === kb.city);

    if (looksBranchVariant) {
        hints.push({
            field: 'branch_variant',
            matchType: 'fuzzy',
            points: 42,
            detail: 'Same base company name with different branch/location suffix',
        });
    }

    const exactIdentityHit = [ka.domain, ka.website, ka.gstin, ka.email, ka.phone, ka.indiamart, ka.facebook, ka.instagram, ka.linkedin]
        .filter(Boolean)
        .some((value) => [kb.domain, kb.website, kb.gstin, kb.email, kb.phone, kb.indiamart, kb.facebook, kb.instagram, kb.linkedin].includes(value));

    const looksRelatedCompany = !exactIdentityHit
        && coreSim >= 0.88
        && tokenJaccard(ka.companyTokens, kb.companyTokens) >= 0.5
        && rawA.toLowerCase() !== rawB.toLowerCase();

    if (looksRelatedCompany) {
        hints.push({
            field: 'group_company',
            matchType: 'fuzzy',
            points: 18,
            detail: 'Possible related companies with same base name; manual review required',
        });
    }

    return hints;
}

/**
 * Compare two in-memory records. Explainable reasons only.
 * Does not auto-merge.
 */
export function compareTwoRecords(a, b, { candidateType = 'discovery_record', candidateId = null, candidateLabel = '' } = {}) {
    const ka = collectRecordKeys(a);
    const kb = collectRecordKeys(b);
    const reasons = [];
    let score = 0;

    function exact(field, points, detail) {
        reasons.push({ field, matchType: 'exact', points, detail });
        score += points;
    }
    function fuzzy(field, points, detail) {
        reasons.push({ field, matchType: 'fuzzy', points, detail });
        score += points;
    }
    function conflict(field, detail) {
        reasons.push({ field, matchType: 'conflict', points: 0, detail });
    }

    if (ka.domain && kb.domain && ka.domain === kb.domain) {
        exact('domain', 40, 'Exact normalized domain: ' + ka.domain);
    }
    if (ka.website && kb.website && ka.website === kb.website && !(ka.domain && ka.domain === kb.domain)) {
        exact('website', 35, 'Exact normalized website URL');
    }
    if (ka.gstin && kb.gstin && ka.gstin === kb.gstin) {
        exact('gstin', 45, 'Exact GSTIN: ' + ka.gstin);
    }
    if (ka.email && kb.email && ka.email === kb.email) {
        exact('email', 30, 'Exact email: ' + ka.email);
    }
    if (ka.phone && kb.phone && ka.phone === kb.phone) {
        exact('phone', 28, 'Exact phone suffix: ' + ka.phone);
    }
    if (ka.indiamart && kb.indiamart && ka.indiamart === kb.indiamart) {
        exact('indiamart', 42, 'Exact IndiaMART profile URL');
    }
    if (ka.facebook && kb.facebook && ka.facebook === kb.facebook) {
        exact('facebook', 38, 'Exact Facebook page URL');
    }
    if (ka.instagram && kb.instagram && ka.instagram === kb.instagram) {
        exact('instagram', 38, 'Exact Instagram profile URL');
    }
    if (ka.linkedin && kb.linkedin && ka.linkedin === kb.linkedin) {
        exact('linkedin', 38, 'Exact LinkedIn URL');
    }

    // Exact name + city
    if (ka.companyKey && kb.companyKey && ka.companyKey === kb.companyKey && ka.city && kb.city && ka.city === kb.city) {
        exact('company_name_city', 32, 'Exact normalized company name + city');
    } else if (ka.companyKey && kb.companyKey) {
        const sim = stringSimilarity(ka.companyKey, kb.companyKey);
        const jac = tokenJaccard(ka.companyTokens, kb.companyTokens);
        const nameScore = Math.max(sim, jac);
        if (nameScore >= 0.86) {
            if (ka.city && kb.city && ka.city === kb.city) {
                fuzzy('company_name_city', Math.round(24 * nameScore), 'Fuzzy company name + same city (' + (nameScore * 100).toFixed(0) + '%)');
            } else if (ka.address && kb.address && stringSimilarity(ka.address, kb.address) >= 0.75) {
                fuzzy('company_name_address', Math.round(22 * nameScore), 'Fuzzy company name + similar address');
            } else if (ka.phone && kb.phone && ka.phone.slice(-6) === kb.phone.slice(-6)) {
                fuzzy('company_name_phone', Math.round(20 * nameScore), 'Fuzzy company name + matching phone suffix');
            } else if (ka.state && kb.state && ka.state === kb.state && nameScore >= 0.92) {
                fuzzy('company_name_state', Math.round(14 * nameScore), 'Fuzzy company name + same state');
            } else if (nameScore >= 0.94 && ka.state && kb.state && ka.state !== kb.state) {
                // Similar name, different state — weaker / review
                fuzzy('company_name_diff_state', 8, 'Similar company name but different state');
                conflict('state', 'States differ: ' + ka.state + ' vs ' + kb.state);
            }
        }
    }

    for (const hint of detectRelationshipHints(a, b, ka, kb)) {
        fuzzy(hint.field, hint.points, hint.detail);
    }

    // Conflicting websites with strong name match
    if (ka.domain && kb.domain && ka.domain !== kb.domain) {
        const jac = tokenJaccard(ka.companyTokens, kb.companyTokens);
        if (jac >= 0.85) conflict('website', 'Similar company names but different domains: ' + ka.domain + ' vs ' + kb.domain);
    }

    // Multi-source agreement bonus on same record keys (when comparing merged-like)
    const sharedSources = (ka.sourceProviders || []).filter((s) => (kb.sourceProviders || []).includes(s));
    if (sharedSources.length >= 1 && score >= 40) {
        fuzzy('multi_source', 5, 'Shared/overlapping source providers');
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const decision = decideFromScoreAndReasons(score, reasons);

    return {
        decision,
        matchScore: score,
        reasons,
        candidate: {
            type: candidateType,
            id: candidateId,
            label: candidateLabel || b.companyName || candidateType,
            companyName: b.companyName || '',
            website: b.website || '',
            email: b.email || '',
            phone: b.phone || b.mobile || '',
            city: b.city || '',
            state: b.stateProvince || b.state || '',
            gstin: b.gstin || '',
        },
        sideBySide: {
            a: {
                companyName: a.companyName,
                website: a.website,
                email: a.email,
                phone: a.phone || a.mobile,
                city: a.city,
                state: a.stateProvince || a.state,
                gstin: a.gstin,
                sourceUrl: a.sourceUrl,
            },
            b: {
                companyName: b.companyName,
                website: b.website,
                email: b.email,
                phone: b.phone || b.mobile,
                city: b.city,
                state: b.stateProvince || b.state,
                gstin: b.gstin,
                sourceUrl: b.sourceUrl,
            },
        },
        autoMergeAllowed: false, // Phase 4: never auto-merge high-risk
    };
}

export function pickBestComparison(comparisons = []) {
    if (!comparisons.length) {
        return {
            decision: 'UNIQUE',
            matchScore: 0,
            reasons: [],
            candidates: [],
            requiresManualReview: false,
            autoMergeAllowed: false,
        };
    }
    const ranked = [...comparisons].sort((x, y) => (y.matchScore || 0) - (x.matchScore || 0));
    const best = ranked[0];
    const requiresManualReview = ['MANUAL_REVIEW_REQUIRED', 'HIGH_PROBABILITY_DUPLICATE', 'POSSIBLE_DUPLICATE'].includes(best.decision)
        || ranked.some((c) => c.decision === 'MANUAL_REVIEW_REQUIRED');
    return {
        decision: best.decision,
        matchScore: best.matchScore,
        reasons: best.reasons,
        candidates: ranked.slice(0, 8).map((c) => ({
            ...c.candidate,
            decision: c.decision,
            matchScore: c.matchScore,
            reasons: c.reasons,
            sideBySide: c.sideBySide,
        })),
        sideBySide: best.sideBySide,
        requiresManualReview,
        autoMergeAllowed: false,
    };
}
