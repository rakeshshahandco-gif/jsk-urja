/**
 * Phase 1C.0 — Prompt Builder skeleton.
 * Assembles PromptBundle for provider adapters. No network.
 */

const DEFAULT_SYSTEM = [
    'You are a WhatsApp sales assistant for an electronics manufacturing CRM.',
    'DRY RUN ONLY: draft a reply for human review. Never claim a message was sent.',
    'Do not invent prices, stock, delivery dates, or warranty terms.',
    'If facts are missing, say a human will follow up.',
    'Stay professional and concise.',
].join(' ');

/**
 * @param {object} input
 * @param {object} input.context — BrainContext
 * @param {object} input.intentResult
 * @param {object} input.entities
 * @param {object} [input.grounding] — GroundingPack (empty in 1C.0)
 * @param {object} [input.route]
 * @returns {{ systemPrompt: string, userPrompt: string, meta: object }}
 */
export function buildPromptBundle(input = {}) {
    const context = input.context || {};
    const intentResult = input.intentResult || {};
    const entities = input.entities || {};
    const groundingPack = input.groundingPack || null;
    const grounding = input.grounding || {
        snippets: (groundingPack?.sources || []).map((s) => s.contentSnippet),
        sourceIds: (groundingPack?.sources || []).map((s) => s.sourceId),
    };
    const route = input.route || {};

    const currentMessage = context.currentMessage?.text
        || context.message?.text
        || '';
    const thread = Array.isArray(context.thread) ? context.thread : (context.messages || []);
    const historyLines = thread.slice(-10).map((m) => {
        const who = m.direction === 'in' ? 'Customer' : (m.direction === 'out' ? 'Agent' : 'System');
        return who + ': ' + String(m.text || '').slice(0, 500);
    });

    const groundingBlock = (grounding.snippets || []).length
        ? grounding.snippets.map((s, i) => '[' + (i + 1) + '] ' + String(s).slice(0, 400)).join('\n')
        : '(no approved knowledge snippets)';

    const userPrompt = [
        'Intent: ' + (intentResult.intent || 'unknown') + ' (confidence=' + (intentResult.confidence ?? '') + ')',
        'Language: ' + (intentResult.detectedLanguage || entities.language || 'en'),
        'Entities: ' + JSON.stringify(entities),
        'Route: ' + (route.path || 'unknown'),
        '',
        'Conversation (recent):',
        historyLines.length ? historyLines.join('\n') : '(none)',
        '',
        'Grounding:',
        groundingBlock,
        '',
        'Customer message:',
        String(currentMessage).slice(0, 2000),
        '',
        'Write a professional draft reply only.',
    ].join('\n');

    return {
        systemPrompt: DEFAULT_SYSTEM,
        userPrompt,
        meta: {
            intent: intentResult.intent || 'unknown',
            language: intentResult.detectedLanguage || entities.language || 'en',
            routePath: route.path || null,
            groundingSourceIds: grounding.sourceIds || [],
            processingVersion: 'ai_brain_foundation_v0',
        },
    };
}

/** @returns {{ build: Function }} */
export function createPromptBuilder() {
    return { build: buildPromptBundle };
}

export default createPromptBuilder;
