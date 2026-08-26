import {
    ARTICLE_TITLE_HINTS,
    COMPANY_TYPE_PATTERNS,
    COMPETING_SENSE_HINTS,
    DEFAULT_THRESHOLDS,
    NON_COMPANY_HOST_HINTS,
    PHASE2_ENGINE_VERSION,
    categoryFromScore,
} from './constants.js';
import { evidenceCorpus, identityDomain } from './inputPayload.util.js';

function tokens(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9+\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

function uniq(list) {
    return [...new Set(list.filter(Boolean))];
}

export function understandSearchIntent(keyword = '', location = '') {
    const kw = String(keyword || '').trim();
    const toks = tokens(kw);
    return {
        keyword: kw,
        location: String(location || '').trim(),
        tokens: toks,
        phrase: kw.toLowerCase(),
        modifiers: toks.slice(0, Math.max(0, toks.length - 1)),
        head: toks[toks.length - 1] || '',
        summary: `Find genuine businesses that match “${kw}”${location ? ` in ${location}` : ''} — not articles, marketplaces, or unrelated uses of similar words.`,
    };
}

function hostLooksNonCompany(website = '', domain = '') {
    const blob = `${website} ${domain}`.toLowerCase();
    return NON_COMPANY_HOST_HINTS.some((h) => blob.includes(h));
}

function looksLikeArticle(payload = {}, corpus = '') {
    const title = String(payload.title || '').toLowerCase();
    if (ARTICLE_TITLE_HINTS.some((h) => title.includes(h))) return true;
    if (/\b(blog|news|article|wikipedia)\b/.test(corpus) && !payload.hasEmail && !payload.hasPhone) return true;
    return hostLooksNonCompany(payload.website, payload.domain);
}

function competingSensePenalty(intent, corpus) {
    if (!intent.modifiers.length || !intent.head || intent.head.length < 4) return { penalty: 0, reason: '' };
    const hasHead = corpus.includes(intent.head);
    const hasModifier = intent.modifiers.some((m) => m.length > 2 && corpus.includes(m));
    if (!hasHead || hasModifier) return { penalty: 0, reason: '' };
    const competing = COMPETING_SENSE_HINTS.filter((h) => corpus.includes(h) && !intent.phrase.includes(h));
    if (!competing.length) return { penalty: 18, reason: `Mentions “${intent.head}” without the search modifiers (${intent.modifiers.join(', ')})` };
    return {
        penalty: 42,
        reason: `Looks like a different sense of “${intent.head}” (${competing.slice(0, 2).join(', ')}) rather than “${intent.keyword}”`,
    };
}

export function classifyCompanyTypes(corpus = '', payload = {}) {
    if (payload.isDirectoryListing || hostLooksNonCompany(payload.website, payload.domain)) {
        const types = ['Marketplace/Directory'];
        for (const { type, re } of COMPANY_TYPE_PATTERNS) {
            if (type === 'Marketplace/Directory') continue;
            if (re.test(corpus) && types.length < 4) types.push(type);
        }
        return types;
    }
    const types = [];
    for (const { type, re } of COMPANY_TYPE_PATTERNS) {
        if (re.test(corpus)) types.push(type);
    }
    return uniq(types).slice(0, 4);
}

export function extractIndustryTags(intent, corpus) {
    const tags = [];
    const phrase = intent.phrase;
    if (phrase && corpus.includes(phrase)) tags.push(intent.keyword);
    for (const tok of intent.tokens) {
        if (tok.length < 3) continue;
        const re = new RegExp(`\\b([a-z0-9]+\\s+){0,2}${tok}(\\s+[a-z0-9]+){0,2}\\b`, 'i');
        const m = corpus.match(re);
        if (m && m[0]) {
            const tag = m[0].replace(/\s+/g, ' ').trim();
            if (tag.length >= 3 && tag.length <= 40) tags.push(tag.replace(/\b\w/g, (c) => c.toUpperCase()));
        }
    }
    return uniq(tags).slice(0, 8);
}

function tokenOverlapScore(intent, corpus) {
    if (!intent.tokens.length) return 0;
    const hits = intent.tokens.filter((t) => corpus.includes(t));
    return hits.length / intent.tokens.length;
}

/**
 * Generic, evidence-only heuristic. Not hard-coded to one industry.
 */
export function heuristicQualify({ job = {}, payload = {} } = {}) {
    const intent = understandSearchIntent(job.keyword || payload.searchKeyword, job.city || payload.location);
    const corpus = evidenceCorpus(payload);
    const evidence = [];
    let score = 8;
    let insufficient = false;

    if (corpus.replace(/\s+/g, ' ').trim().length < 40) {
        insufficient = true;
        evidence.push('Too little public text to judge relevance');
    }

    const overlap = tokenOverlapScore(intent, corpus);
    score += Math.round(overlap * 38);
    if (overlap >= 1) evidence.push(`All search terms appear in extracted text (${intent.keyword})`);
    else if (overlap >= 0.5) evidence.push(`Partial match to search terms (${intent.keyword})`);
    else evidence.push(`Weak overlap with search keyword “${intent.keyword}”`);

    if (intent.phrase && corpus.includes(intent.phrase)) {
        score += 28;
        evidence.push(`Website/listing describes the business using “${intent.keyword}”`);
    }

    const name = String(payload.companyName || '').toLowerCase();
    if (intent.tokens.filter((t) => t.length > 2).every((t) => name.includes(t)) && name) {
        score += 12;
        evidence.push('Company name itself matches the search intent');
    }

    const loc = String(payload.city || payload.state || '').toLowerCase();
    const jobLoc = String(job.city || '').toLowerCase();
    if (jobLoc && loc.includes(jobLoc)) {
        score += 6;
        evidence.push(`Location evidence includes ${job.city}`);
    }

    if (payload.hasEmail || payload.hasPhone) {
        score += 6;
        evidence.push('Public contact details were extracted');
    }

    const identity = identityDomain({ normalizedDomain: payload.domain, website: payload.website });
    if (identity) {
        score += 4;
        evidence.push(`Company website/domain found (${identity})`);
    }

    if (looksLikeArticle(payload, corpus)) {
        score = Math.min(score, 34);
        evidence.push('Looks like an article, directory page, or marketplace listing rather than the operating company');
    }

    if (payload.isDirectoryListing && !identity) {
        score = Math.min(score, 62);
        evidence.push('Directory listing without a confirmed company website');
    }

    const competing = competingSensePenalty(intent, corpus);
    if (competing.penalty) {
        score -= competing.penalty;
        evidence.push(competing.reason);
    }

    score = Math.max(0, Math.min(100, score));

    let category = categoryFromScore(score, DEFAULT_THRESHOLDS);
    if (insufficient || (overlap < 0.34 && corpus.length < 120)) {
        category = 'Insufficient Information';
        score = Math.min(score, 35);
    }

    const companyTypes = classifyCompanyTypes(corpus, payload);
    const industryTags = extractIndustryTags(intent, corpus);

    return {
        score,
        category,
        evidence: uniq(evidence).slice(0, 8),
        companyTypes,
        industryTags,
        searchIntent: intent.summary,
        engineUsed: 'heuristic',
        engineVersion: PHASE2_ENGINE_VERSION,
        fieldConfidence: {
            company: {
                level: payload.companyName ? 'High' : 'Low',
                evidence: payload.companyName ? 'Extracted company name' : 'Not Available',
            },
            website: {
                level: identity ? 'High' : (payload.website ? 'Medium' : 'Low'),
                evidence: identity || payload.website || 'Not Available',
            },
            industryRelevance: {
                level: category === 'Insufficient Information' ? 'Low' : (score >= 70 ? 'High' : 'Medium'),
                evidence: evidence[0] || 'Keyword overlap on extracted text',
            },
            companyType: {
                level: companyTypes.length ? 'Medium' : 'Low',
                evidence: companyTypes.length ? companyTypes.join(' + ') : 'Insufficient Information',
            },
        },
    };
}
