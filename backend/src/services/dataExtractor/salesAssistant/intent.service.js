import { INTENTS } from './constants.js';
import { detectActionRequest } from './safety.service.js';
import { extractFiltersAndEntities } from './filters.service.js';

const PATTERNS = [
    { intent: 'UNSUPPORTED_ACTION', re: null }, // handled via safety
    { intent: 'HELP', re: /\b(help|what can you|suggested questions|how (do|to) use)\b/i },
    { intent: 'EXPORT_REQUEST', re: /\b(export|download)\b/i },
    { intent: 'PRE_CALL_BRIEF', re: /\b(pre[- ]?call|before i call|call brief|brief (me|for (the )?call))\b/i },
    { intent: 'COMPANY_SUMMARY', re: /\b(summarize|summary|company overview|tell me about)\b/i },
    { intent: 'LEAD_SCORE_EXPLANATION', re: /\b(lead score|why.*(high|low) score|score explanation|explain.*score|grade)\b/i },
    { intent: 'PRODUCT_RECOMMENDATION', re: /\b(product (rec|recommend)|recommended products|suitable for|dali|which products)\b/i },
    { intent: 'CONTACT_AVAILABILITY', re: /\b(contact availability|decision[- ]maker|without (email|phone|contact|decision))\b/i },
    { intent: 'CONTACT_SEARCH', re: /\b(find contact|contact details|who (to|should i) (call|email))\b/i },
    { intent: 'SIMILAR_COMPANY_SEARCH', re: /\b(similar compan|companies like|lookalike)\b/i },
    { intent: 'MARKET_ANALYSIS', re: /\b(market (coverage|intelligence|analysis)|territory coverage)\b/i },
    { intent: 'DUPLICATE_EXPLANATION', re: /\b(duplicate|dedup)\b/i },
    { intent: 'CRM_ENRICHMENT_STATUS', re: /\b(crm enrichment|enrichment draft|approved crm)\b/i },
    { intent: 'SALES_WORKFLOW_STATUS', re: /\b(sales workflow|assignment draft|pending.*workflow)\b/i },
    { intent: 'TASK_FOLLOWUP_STATUS', re: /\b(follow[- ]?up|task (due|status)|due today|overdue)\b/i },
    { intent: 'CAMPAIGN_DRAFT_STATUS', re: /\b(campaign draft|ready for handoff|handoff)\b/i },
    { intent: 'BATCH_STATUS', re: /\b(batch (job|status)|failed batch|stale batch)\b/i },
    { intent: 'OUTDATED_RECORDS', re: /\b(outdated|stale record|needs? refresh)\b/i },
    { intent: 'MANUAL_REVIEW_QUEUE', re: /\b(manual review|review queue)\b/i },
    { intent: 'DATA_QUALITY_QUERY', re: /\b(data quality|missing (email|phone|data)|incomplete)\b/i },
    { intent: 'ANALYTICS_SUMMARY', re: /\b(analytics|kpi|dashboard|executive summary|funnel)\b/i },
    { intent: 'FILTER_LEADS', re: /\b(high[- ]priority|top leads|best prospects|score (above|over|>=|>)|priority)\b/i },
    { intent: 'SEARCH_COMPANIES', re: /\b(show|find|list|search).*(compan|lead|manufacturer|in \w+)/i },
];

export function classifyIntent(question, sessionContext = {}) {
    const text = String(question || '').trim();
    const action = detectActionRequest(text);
    if (action.blocked) {
        return {
            intent: 'UNSUPPORTED_ACTION',
            confidence: 0.99,
            extractedEntities: {},
            extractedFilters: {},
            requestedOutput: 'block',
            requiredPermissions: [],
            safetyClassification: action.safetyClassification,
            clarificationRequired: false,
            actionType: action.actionType,
            action,
        };
    }

    const extracted = extractFiltersAndEntities(text, sessionContext);
    let best = { intent: 'AMBIGUOUS', confidence: 0.35 };

    for (const p of PATTERNS) {
        if (!p.re) continue;
        if (p.re.test(text)) {
            best = { intent: p.intent, confidence: 0.86 };
            break;
        }
    }

    // Follow-up refinements with prior intent
    if (best.intent === 'AMBIGUOUS' && sessionContext?.lastIntent && /^(show only|now |open the|compare|why is|filter)/i.test(text)) {
        best = { intent: sessionContext.lastIntent, confidence: 0.75 };
    }

    if (best.intent === 'SEARCH_COMPANIES' && (extracted.filters.priority || extracted.filters.minScore)) {
        best = { intent: 'FILTER_LEADS', confidence: Math.max(best.confidence, 0.8) };
    }

    const clarificationRequired = best.confidence < 0.55 || best.intent === 'AMBIGUOUS';

    return {
        intent: INTENTS.includes(best.intent) ? best.intent : 'AMBIGUOUS',
        confidence: best.confidence,
        extractedEntities: extracted.entities,
        extractedFilters: extracted.filters,
        requestedOutput: clarificationRequired ? 'clarification' : 'answer',
        requiredPermissions: [],
        safetyClassification: 'SAFE_READ',
        clarificationRequired,
        actionType: null,
        action: null,
    };
}
