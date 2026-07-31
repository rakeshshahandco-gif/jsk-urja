/**
 * Isolated AI provider adapter for industry classification.
 * Never logs API keys. Provider is selectable via settings/env.
 */
const OPENAI_MODEL = () => String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();

export function getConfiguredAiProvider(settings = {}) {
    const preferred = String(settings?.aiLeadIntelligence?.aiProvider || process.env.EXTRACTOR_AI_PROVIDER || 'openai').trim().toLowerCase();
    const openAiKey = String(process.env.EXTRACTOR_OPENAI_API_KEY || '').trim();
    if (preferred === 'openai' && openAiKey) {
        return { id: 'openai', configured: true, model: OPENAI_MODEL() };
    }
    if (openAiKey) {
        return { id: 'openai', configured: true, model: OPENAI_MODEL() };
    }
    return { id: preferred || 'none', configured: false, model: '' };
}

async function callOpenAiJson(prompt) {
    const apiKey = String(process.env.EXTRACTOR_OPENAI_API_KEY || '').trim();
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
                    content: 'You classify B2B companies into industries using ONLY provided public text and allowed master IDs. Never invent products, certifications, revenue, GSTIN, contacts, or unsupported activities. Return strict JSON.',
                },
                { role: 'user', content: prompt },
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

export async function classifyWithAiProvider({ record, masters, ruleSuggestion, settings }) {
    const provider = getConfiguredAiProvider(settings);
    if (!provider.configured) {
        throw new Error('AI provider not configured');
    }

    const allowedIndustries = (masters.industries || []).map((x) => ({
        id: String(x._id),
        parentIndustry: x.parentIndustry,
        subIndustry: x.subIndustry,
    }));
    const allowedCustomerTypes = (masters.customerTypes || []).map((x) => ({
        id: String(x._id),
        name: x.name,
    }));

    const prompt = `Classify this public business record.
Company: ${record.companyName || ''}
Legal name: ${record.legalName || ''}
Website: ${record.website || record.sourceUrl || ''}
City/State/Country: ${[record.city, record.stateProvince || record.state, record.country].filter(Boolean).join(', ')}
Description: ${String(record.businessDescription || '').slice(0, 900)}
Keywords: ${(record.keywords || []).join(', ')}
Products/categories: ${(record.productCategories || []).join(', ')}

Allowed industries (use only these IDs):
${allowedIndustries.map((x) => `- ${x.id}: ${x.parentIndustry} / ${x.subIndustry}`).join('\n')}

Allowed customer types (use only these IDs):
${allowedCustomerTypes.map((x) => `- ${x.id}: ${x.name}`).join('\n')}

Rule suggestion (may use or revise if unsupported):
${JSON.stringify(ruleSuggestion || {}, null, 2)}

Return JSON:
{
  "primaryIndustryId": "allowed id or empty",
  "secondaryIndustryIds": ["allowed ids"],
  "customerTypeId": "allowed id or empty",
  "status": "CLASSIFIED|LOW_CONFIDENCE|MULTIPLE_POSSIBILITIES|IRRELEVANT|MANUAL_REVIEW_REQUIRED",
  "confidence": 0,
  "evidence": ["snippets from provided text only"],
  "keywordsFound": ["..."],
  "manualReviewReason": ""
}`;

    if (provider.id === 'openai') {
        const parsed = await callOpenAiJson(prompt);
        return {
            provider: provider.id,
            model: provider.model,
            raw: parsed,
        };
    }
    throw new Error('Unsupported AI provider: ' + provider.id);
}
