import { COMPANY_TYPES, PHASE2_ENGINE_VERSION, QUALIFICATION_CATEGORIES, categoryFromScore } from './constants.js';
import { heuristicQualify } from './heuristicQualify.util.js';

const OPENAI_MODEL = () => String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();

export function getPhase2AiProvider() {
    if (process.env.EXTRACTOR_PHASE2_FORCE_HEURISTIC === '1') {
        return { available: false, provider: '', model: '', reason: 'AI unavailable (simulated)' };
    }
    const key = String(process.env.EXTRACTOR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const model = OPENAI_MODEL();
    if (!key) return { available: false, provider: '', model: '', reason: 'AI key not configured' };
    return { available: true, provider: 'openai', model, reason: '' };
}

function sanitizeAiResult(raw, heuristic, payload) {
    const score = Math.max(0, Math.min(100, Number(raw?.score)));
    let category = QUALIFICATION_CATEGORIES.includes(raw?.category) ? raw.category : categoryFromScore(score);
    if (!Number.isFinite(score)) {
        return { ...heuristic, engineUsed: 'heuristic', fallbackReason: 'AI returned invalid score' };
    }

    const evidence = Array.isArray(raw?.evidence)
        ? raw.evidence.map((e) => String(e || '').trim()).filter(Boolean).slice(0, 8)
        : heuristic.evidence;

    const allowedTypes = new Set(COMPANY_TYPES);
    const companyTypes = Array.isArray(raw?.companyTypes)
        ? raw.companyTypes.map((t) => String(t || '').trim()).filter((t) => allowedTypes.has(t)).slice(0, 4)
        : heuristic.companyTypes;

    const corpus = [
        payload.companyName, payload.businessDescription, payload.aboutUsText,
        payload.productServiceText, payload.title, payload.metaDescription,
        payload.directoryDescription, ...(payload.categories || []),
    ].join(' ').toLowerCase();

    const industryTags = Array.isArray(raw?.industryTags)
        ? raw.industryTags
            .map((t) => String(t || '').trim())
            .filter((t) => t && t.length <= 40 && corpus.includes(t.toLowerCase()))
            .slice(0, 8)
        : heuristic.industryTags;

    return {
        score,
        category,
        evidence: evidence.length ? evidence : heuristic.evidence,
        companyTypes: companyTypes.length ? companyTypes : heuristic.companyTypes,
        industryTags: industryTags.length ? industryTags : heuristic.industryTags,
        searchIntent: String(raw?.searchIntent || heuristic.searchIntent || '').slice(0, 400),
        engineUsed: 'openai',
        engineVersion: PHASE2_ENGINE_VERSION,
        model: OPENAI_MODEL(),
        fieldConfidence: heuristic.fieldConfidence,
    };
}

async function callOpenAiJson(payload, intentSummary) {
    const apiKey = String(process.env.EXTRACTOR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) throw new Error('AI provider key not configured');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OPENAI_MODEL(),
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: [
                        'You qualify B2B prospects against the user search intent.',
                        'Use ONLY the JSON evidence. Never invent company names, phones, emails, websites, addresses, products, certifications, GSTIN, revenue, employees, or customers.',
                        'If a fact is missing, say Not Available / Insufficient Information.',
                        'Distinguish genuine matching businesses from electricians/architects/consumers/blogs/Amazon listings/news/unrelated industry senses of the same words.',
                        'This must work for ANY business keyword, not only one industry.',
                        'Return JSON: { searchIntent, score (0-100), category, evidence (string[]), companyTypes (string[]), industryTags (string[]) }.',
                        `category must be one of: ${QUALIFICATION_CATEGORIES.join(', ')}.`,
                        `companyTypes must be a subset of: ${COMPANY_TYPES.join(', ')}.`,
                        'industryTags must be phrases that appear in the evidence.',
                    ].join(' '),
                },
                {
                    role: 'user',
                    content: JSON.stringify({ intentHint: intentSummary, evidence: payload }),
                },
            ],
        }),
        signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`AI provider HTTP ${res.status}: ${body.slice(0, 160)}`);
    }
    const data = await res.json();
    return JSON.parse(data?.choices?.[0]?.message?.content || '{}');
}

/**
 * Qualify one company. Falls back to heuristic if AI is off/unavailable.
 * Never throws for provider failures — returns Failed/Pending-capable result.
 */
export async function qualifyCompany({ job, payload, forceUnavailable = false } = {}) {
    const heuristic = heuristicQualify({ job, payload });
    const cfg = forceUnavailable
        ? { available: false, reason: 'AI unavailable (simulated)' }
        : getPhase2AiProvider();

    if (!cfg.available) {
        return {
            ...heuristic,
            engineUsed: 'heuristic',
            fallbackReason: cfg.reason,
            aiAvailable: false,
        };
    }

    try {
        const aiRaw = await callOpenAiJson(payload, heuristic.searchIntent);
        const sanitized = sanitizeAiResult(aiRaw, heuristic, payload);
        return { ...sanitized, aiAvailable: true, fallbackReason: '' };
    } catch (err) {
        return {
            ...heuristic,
            engineUsed: 'heuristic',
            aiAvailable: false,
            fallbackReason: String(err?.message || 'AI request failed').slice(0, 240),
            statusHint: 'Failed',
        };
    }
}
