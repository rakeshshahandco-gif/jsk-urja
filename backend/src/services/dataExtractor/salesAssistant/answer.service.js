import { SUGGESTED_QUESTIONS } from './constants.js';
import { navSuggestion } from './normalize.util.js';

export function buildGroundedAnswer({
    classification,
    plan,
    toolResults,
    evidence,
    limitations,
    effectivePermissions,
    providerStatus = 'UNUSED',
    providerMode = 'RULE_ONLY',
}) {
    if (classification.intent === 'UNSUPPORTED_ACTION') {
        return {
            type: 'unsupported_action',
            headline: 'Read-only Assistant',
            text: classification.action?.message
                || 'Phase 17 Assistant is read-only and cannot perform write actions.',
            results: [],
            evidence,
            limitations: [...(limitations || []), 'No write endpoint is exposed'],
            navigationSuggestions: classification.action?.navigationSuggestions || [],
            confidence: classification.confidence,
            clarificationRequired: false,
            providerStatus,
            providerMode,
            aggregateOnly: !!effectivePermissions?.aggregateOnly,
        };
    }

    if (classification.clarificationRequired || plan.expectedOutput === 'clarification') {
        return {
            type: 'clarification',
            headline: 'Clarification needed',
            text: plan.clarification || 'Please clarify your question. Do not silently guess.',
            results: [],
            evidence: [],
            limitations: ['Low-confidence intent — clarification required'],
            navigationSuggestions: [],
            confidence: classification.confidence,
            clarificationRequired: true,
            suggestedQuestions: SUGGESTED_QUESTIONS.slice(0, 6),
            providerStatus,
            providerMode,
            aggregateOnly: !!effectivePermissions?.aggregateOnly,
        };
    }

    if (classification.intent === 'HELP') {
        return {
            type: 'help',
            headline: 'AI Sales Assistant (read-only)',
            text: 'Ask grounded questions about discovered companies, scores, products, contacts, drafts, analytics, and data quality. Write actions are blocked.',
            results: [],
            evidence: [],
            limitations: ['Assistant never sends email/WhatsApp or mutates CRM'],
            navigationSuggestions: [],
            confidence: 1,
            clarificationRequired: false,
            suggestedQuestions: SUGGESTED_QUESTIONS,
            providerStatus,
            providerMode,
            aggregateOnly: !!effectivePermissions?.aggregateOnly,
        };
    }

    const sections = [];
    const results = [];
    for (const [tool, r] of Object.entries(toolResults || {})) {
        if (!r?.ok && r?.data == null) {
            limitations.push(...(r?.limitations || [`${tool} unavailable`]));
            continue;
        }
        sections.push({ tool, data: r.data, limitations: r.limitations || [] });
        if (r.data?.items) results.push(...r.data.items);
        else if (r.data) results.push({ tool, ...((typeof r.data === 'object' && !Array.isArray(r.data)) ? r.data : { value: r.data }) });
    }

    const missing = sections.length === 0;
    const textParts = [];
    if (missing) {
        textParts.push('Evidence is incomplete or data is not available for this question.');
    } else {
        textParts.push(`Grounded answer for intent ${classification.intent} using ${Object.keys(toolResults || {}).length} read-only tool(s).`);
        if (results.length) textParts.push(`Showing ${Math.min(results.length, plan.limit || 20)} result row(s) from approved sources.`);
    }

    const nav = [];
    if ((toolResults.getCrmEnrichmentStatus?.data?.items || []).some((i) => i.draftNotApplied)) {
        nav.push(navSuggestion({
            label: 'Open CRM Enrichment Draft',
            reason: 'Review draft status on the controlled screen',
            targetModule: 'crm_enrichment',
            navigationRoute: '/data-extractor/ai-lead-intelligence/crm-enrichment',
            requiredPermission: 'data_extractor.crm_enrichment.view',
        }));
    }
    if ((toolResults.getSalesWorkflowStatus?.data?.items || []).some((i) => i.draftNotApplied)) {
        nav.push(navSuggestion({
            label: 'Open Sales Workflow Draft',
            reason: 'Review assignment draft — Assistant cannot apply',
            targetModule: 'sales_workflow',
            navigationRoute: '/data-extractor/ai-lead-intelligence/sales-workflow',
            requiredPermission: 'data_extractor.sales_workflow.view',
        }));
    }
    if ((toolResults.getCampaignDraftStatus?.data?.items || []).length) {
        nav.push(navSuggestion({
            label: 'Open Campaign Draft',
            reason: 'Handoff is not sent from Assistant',
            targetModule: 'marketing',
            navigationRoute: '/data-extractor/ai-lead-intelligence/marketing-intelligence',
            requiredPermission: 'data_extractor.marketing_intelligence.view',
        }));
    }

    const uniqLimitations = [...new Set([
        ...(limitations || []),
        ...sections.flatMap((s) => s.limitations || []),
        ...(evidence || []).some((e) => e.freshness === 'OUTDATED') ? ['Outdated evidence present — treat with caution'] : [],
        'Business facts come only from retrieved evidence',
        'Approximate KPI values must be labelled approximate',
        'Market coverage is not market share',
    ])];

    return {
        type: 'grounded_answer',
        headline: classification.intent.replace(/_/g, ' '),
        text: textParts.join(' '),
        sections,
        results: results.slice(0, plan.limit || 20),
        evidence: (evidence || []).slice(0, 30),
        limitations: uniqLimitations,
        navigationSuggestions: nav.map((n) => ({ ...n, executable: false })),
        confidence: classification.confidence,
        clarificationRequired: false,
        filters: plan.filters || {},
        providerStatus,
        providerMode,
        aggregateOnly: !!effectivePermissions?.aggregateOnly,
        whyThisAnswer: 'Answer constructed only from allowlisted read-only tool evidence.',
    };
}

/** Deterministic AI fallback — formatting only, never invents facts. */
export function formatWithFallback(answer, { aiAvailable = false, mode = 'RULE_ONLY' } = {}) {
    if (!aiAvailable || mode === 'RULE_ONLY' || mode === 'TEMPLATE_ONLY') {
        return {
            ...answer,
            providerStatus: aiAvailable ? 'UNUSED' : 'PROVIDER_UNAVAILABLE',
            providerMode: mode === 'AI_ASSISTED' || mode === 'HYBRID' ? 'RULE_ONLY_FALLBACK' : mode,
            aiNote: aiAvailable
                ? 'AI optional formatting skipped; deterministic template used.'
                : 'AI unavailable — deterministic search and template summaries still work.',
        };
    }
    // No external AI call in Phase 17 default — keep deterministic
    return {
        ...answer,
        providerStatus: 'PROVIDER_UNAVAILABLE',
        providerMode: 'RULE_ONLY_FALLBACK',
        aiNote: 'AI-assisted mode requested but no provider configured; used deterministic fallback.',
    };
}
