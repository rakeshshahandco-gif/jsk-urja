import { guessBusinessType } from './companyNormalizer.service.js';
import { applyLeadScores } from './leadScoring.service.js';

const AI_VERSION = 'extractor-ai-v1';
const OPENAI_MODEL = () => String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();
const MAX_OPENAI_RECORDS = 10;

export function isOpenAiConfigured() {
    return !!String(process.env.EXTRACTOR_OPENAI_API_KEY || '').trim();
}

export function getAiLayerStatus(settings) {
    const aiEnabled = !!settings?.aiEnabled;
    const openAiConfigured = isOpenAiConfigured();
    if (!aiEnabled) {
        return {
            aiEnabled: false,
            openAiConfigured,
            mode: 'disabled',
            message: 'AI layer is off. Enable in settings for auto-classification, scoring, and translation.',
        };
    }
    if (openAiConfigured) {
        return {
            aiEnabled: true,
            openAiConfigured: true,
            mode: 'openai+heuristic',
            model: OPENAI_MODEL(),
            message: 'AI enabled — OpenAI translation/classification + heuristic scoring on search results.',
        };
    }
    return {
        aiEnabled: true,
        openAiConfigured: false,
        mode: 'heuristic_only',
        message: 'AI enabled (heuristic mode). Add EXTRACTOR_OPENAI_API_KEY to backend .env for Chinese/export translation.',
    };
}

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

export function containsCjk(text) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(String(text || ''));
}

function buildAiSummary(record, classification, translatedNote) {
    const parts = [];
    if (classification) parts.push(`Type: ${classification.replace(/_/g, ' ')}`);
    if (record.city && record.country) parts.push(`Location: ${[record.city, record.stateProvince, record.country].filter(Boolean).join(', ')}`);
    if (translatedNote) parts.push(translatedNote);
    const desc = normalizeText(record.businessDescription);
    if (desc && !containsCjk(desc)) parts.push(desc.slice(0, 160));
    return parts.join(' · ').slice(0, 400);
}

function heuristicEnrichRecord(record, searchKeyword = '') {
    const description = normalizeText(record.businessDescription);
    const classification = guessBusinessType({
        ...record,
        keywords: [...(record.keywords || []), searchKeyword].filter(Boolean),
    });

    let translatedDescription = '';
    let translationNote = '';
    if (containsCjk(description)) {
        translationNote = 'Non-English text detected — add EXTRACTOR_OPENAI_API_KEY for full translation';
    }

    const confidenceBoost = classification !== 'business' ? 5 : 0;
    const contactBoost = (record.email ? 3 : 0) + (record.phone || record.mobile ? 3 : 0);
    const confidenceScore = Math.min(100, (Number(record.confidenceScore) || 0) + confidenceBoost + contactBoost);

    const aiSummary = buildAiSummary(
        { ...record, businessDescription: translatedDescription || description },
        classification,
        translationNote,
    );

    return {
        ...record,
        businessDescription: description,
        natureOfBusiness: record.natureOfBusiness || classification,
        aiClassification: classification,
        aiSummary,
        confidenceScore,
        rawExtractedData: {
            ...(record.rawExtractedData || {}),
            _ai: {
                version: AI_VERSION,
                mode: 'heuristic',
                at: new Date().toISOString(),
                translationNote: translationNote || undefined,
                originalDescription: containsCjk(description) ? description.slice(0, 500) : undefined,
            },
        },
    };
}

async function callOpenAiJson(prompt) {
    const apiKey = String(process.env.EXTRACTOR_OPENAI_API_KEY || '').trim();
    if (!apiKey) throw new Error('EXTRACTOR_OPENAI_API_KEY is not set');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OPENAI_MODEL(),
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'You assist B2B lead research. Return strict JSON only. Use public business data assumptions. Do not invent contact details.',
                },
                { role: 'user', content: prompt },
            ],
        }),
        signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 180)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
}

async function openAiEnrichRecord(record, searchKeyword = '') {
    const description = normalizeText(record.businessDescription);
    const prompt = `Analyze this B2B company extract for a CRM lead tool.
Search keyword: ${searchKeyword || 'n/a'}
Company: ${record.companyName || ''}
Website: ${record.website || record.sourceUrl || ''}
City: ${record.city || ''}
Country: ${record.country || ''}
Description: ${description.slice(0, 800)}

Return JSON:
{
  "companyNameClean": "short clean name",
  "classification": "manufacturer|trader|exporter|importer|dealer|integrator|oem|business",
  "englishSummary": "1-2 sentence English summary",
  "translatedDescription": "English translation of description if non-English, else same as input trimmed",
  "productCategories": ["up to 3 categories"],
  "leadScoreHint": 0-100 relevance to search keyword
}`;

    const parsed = await callOpenAiJson(prompt);
    const classification = String(parsed.classification || guessBusinessType(record)).toLowerCase();
    const translatedDescription = normalizeText(parsed.translatedDescription || parsed.englishSummary || description);
    const productCategories = Array.isArray(parsed.productCategories)
        ? parsed.productCategories.map((x) => normalizeText(x)).filter(Boolean).slice(0, 5)
        : record.productCategories;

    const leadHint = Math.min(100, Math.max(0, Number(parsed.leadScoreHint) || 0));
    const confidenceScore = Math.min(100, Math.round(
        (Number(record.confidenceScore) || 40) * 0.6 + leadHint * 0.4,
    ));

    return {
        ...record,
        companyName: normalizeText(parsed.companyNameClean) || record.companyName,
        businessDescription: translatedDescription || description,
        natureOfBusiness: classification,
        aiClassification: classification,
        aiSummary: normalizeText(parsed.englishSummary) || buildAiSummary(record, classification, ''),
        productCategories: productCategories?.length ? productCategories : record.productCategories,
        confidenceScore,
        rawExtractedData: {
            ...(record.rawExtractedData || {}),
            _ai: {
                version: AI_VERSION,
                mode: 'openai',
                model: OPENAI_MODEL(),
                at: new Date().toISOString(),
                leadScoreHint: leadHint,
            },
        },
    };
}

export async function enrichRecordWithAi(record, settings, { searchKeyword = '', useOpenAi = true } = {}) {
    if (!settings?.aiEnabled) return record;

    let enriched = heuristicEnrichRecord(record, searchKeyword);

    if (useOpenAi && isOpenAiConfigured()) {
        try {
            enriched = await openAiEnrichRecord(enriched, searchKeyword);
        } catch (err) {
            enriched.rawExtractedData = {
                ...(enriched.rawExtractedData || {}),
                _ai: {
                    ...(enriched.rawExtractedData?._ai || {}),
                    openAiError: err?.message || 'OpenAI failed',
                    mode: 'heuristic_fallback',
                },
            };
        }
    }

    return applyLeadScores([enriched])[0];
}

export async function enrichRecordsWithAi(records, settings, { searchKeyword = '' } = {}) {
    if (!settings?.aiEnabled || !records?.length) return records;

    const out = [];
    for (let i = 0; i < records.length; i++) {
        const useOpenAi = isOpenAiConfigured() && i < MAX_OPENAI_RECORDS;
        // eslint-disable-next-line no-await-in-loop
        out.push(await enrichRecordWithAi(records[i], settings, { searchKeyword, useOpenAi }));
    }
    return out;
}

export async function testAiConnection(settings) {
    const status = getAiLayerStatus(settings);
    if (!settings?.aiEnabled) {
        return { ok: false, message: status.message };
    }
    if (!isOpenAiConfigured()) {
        return {
            ok: true,
            message: 'Heuristic AI ready (classification + scoring). Add EXTRACTOR_OPENAI_API_KEY for translation.',
            mode: status.mode,
        };
    }
    try {
        const sample = await callOpenAiJson('Return JSON: {"status":"ok","message":"CRM Data Extractor AI connected"}');
        return {
            ok: true,
            message: sample.message || 'OpenAI connected',
            mode: status.mode,
            model: OPENAI_MODEL(),
        };
    } catch (err) {
        return { ok: false, message: err?.message || 'OpenAI test failed', mode: status.mode };
    }
}
