import { classifyIntent } from './intent.service.js';
import { buildQueryPlan } from './planner.service.js';
import { validateQueryPlan } from './validator.service.js';
import { executeTools, listRegisteredTools } from './tools.service.js';
import { buildGroundedAnswer, formatWithFallback } from './answer.service.js';
import { getAssistantSettings } from './settings.service.js';
import {
    appendMessage, updateSessionContext, writeAudit, loadOwnedSession, touchSavedPrompt,
} from './session.service.js';
import {
    assertAsk, resolveEffectivePermissions, hasAssistant,
} from './permissions.util.js';
import { PERMS } from './constants.js';
import {
    assertNoSecrets, rejectTenantOverrides, sanitizeUserText, sanitizeError,
} from './normalize.util.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * Core ask orchestrator — read-only end-to-end.
 */
export async function askQuestion(companyId, userId, sessionId, body = {}, user = null) {
    const started = Date.now();
    assertAsk(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);

    const question = sanitizeUserText(body.question || body.text || '', 4000);
    if (!question) throw new ApiError(400, 'question is required');

    const session = await loadOwnedSession(companyId, sessionId, userId);
    // Revalidate permissions every question — do not trust stale session grants
    const effective = resolveEffectivePermissions(user);
    if (!effective.assistant.ask && !effective.assistant.view && !effective.assistant.manage) {
        throw new ApiError(403, 'Permission removed — session context access invalidated');
    }

    const settings = await getAssistantSettings(companyId);
    const mode = body.mode || session.mode || settings.mode || 'HYBRID';

    await appendMessage(companyId, sessionId, userId, {
        role: 'user',
        content: question,
        intent: '',
        safetyClassification: 'PENDING',
    });

    const classification = classifyIntent(question, session.context || {});
    let answer;
    let plan = null;
    let toolsExecuted = [];
    let blocked = classification.intent === 'UNSUPPORTED_ACTION';
    let blockReason = blocked ? (classification.action?.message || 'Write/unsafe action blocked') : '';
    let evidence = [];
    let limitations = [];

    try {
        if (blocked) {
            plan = buildQueryPlan(classification, settings, session.context || {});
            answer = buildGroundedAnswer({
                classification,
                plan,
                toolResults: {},
                evidence: [],
                limitations: [],
                effectivePermissions: effective,
            });
        } else {
            plan = validateQueryPlan(buildQueryPlan(classification, settings, session.context || {}), settings);
            // Force aggregateOnly from permissions, never from client
            plan.aggregateOnly = effective.aggregateOnly;

            const toolResults = plan.tools.length
                ? await executeTools(plan.tools, {
                    companyId,
                    user,
                    userId,
                    filters: plan.filters,
                    entities: plan.entities,
                    limit: plan.limit,
                    settings,
                    priorResults: [],
                })
                : { executed: [], results: {}, evidence: [], limitations: [] };

            toolsExecuted = toolResults.executed;
            evidence = toolResults.evidence;
            limitations = toolResults.limitations;

            answer = buildGroundedAnswer({
                classification,
                plan,
                toolResults: toolResults.results,
                evidence,
                limitations,
                effectivePermissions: effective,
            });
        }

        answer = formatWithFallback(answer, {
            aiAvailable: settings.aiAssistedEnabled === true,
            mode,
        });
        assertNoSecrets(answer);
    } catch (err) {
        const sanitized = sanitizeError(err);
        await writeAudit(companyId, userId, {
            sessionId,
            questionPreview: question.slice(0, 200),
            intent: classification.intent,
            safetyClassification: classification.safetyClassification,
            toolsRequested: plan?.tools || [],
            toolsExecuted,
            blocked: true,
            blockReason: sanitized,
            permissionsUsed: Object.keys(effective.assistant).filter((k) => effective.assistant[k]),
            resultCount: 0,
            limitations: [sanitized],
            durationMs: Date.now() - started,
            errorSanitized: sanitized,
        });
        throw err.statusCode ? err : new ApiError(err.statusCode || 500, sanitized);
    }

    const assistantMsg = await appendMessage(companyId, sessionId, userId, {
        role: 'assistant',
        content: answer.text,
        intent: classification.intent,
        confidence: classification.confidence,
        safetyClassification: classification.safetyClassification,
        queryPlan: plan,
        answer,
        evidenceRefs: evidence,
        limitations: answer.limitations || [],
        navigationSuggestions: answer.navigationSuggestions || [],
        clarificationRequired: !!answer.clarificationRequired,
        providerMode: answer.providerMode,
        providerStatus: answer.providerStatus,
        contextPatch: {
            filters: plan?.filters || session.context?.filters || {},
            lastIntent: classification.intent,
            lastResultRefs: (answer.results || []).slice(0, 20).map((r) => ({
                id: r.id || null,
                companyName: r.companyName || null,
            })),
        },
    });

    await updateSessionContext(companyId, sessionId, userId, {
        filters: plan?.filters || {},
        lastIntent: classification.intent,
        lastResultRefs: (answer.results || []).slice(0, 20).map((r) => ({
            id: r.id || null,
            companyName: r.companyName || null,
        })),
        entities: plan?.entities || {},
    });

    await writeAudit(companyId, userId, {
        sessionId,
        messageId: assistantMsg._id,
        questionPreview: question.slice(0, 200),
        intent: classification.intent,
        safetyClassification: classification.safetyClassification,
        toolsRequested: plan?.tools || [],
        toolsExecuted,
        blocked,
        blockReason,
        permissionsUsed: Object.keys(effective.assistant).filter((k) => effective.assistant[k]),
        resultCount: (answer.results || []).length,
        limitations: answer.limitations || [],
        durationMs: Date.now() - started,
    });

    return {
        sessionId,
        messageId: assistantMsg._id,
        classification: {
            intent: classification.intent,
            confidence: classification.confidence,
            clarificationRequired: classification.clarificationRequired,
            safetyClassification: classification.safetyClassification,
        },
        queryPlan: plan,
        answer,
        effectivePermissions: {
            aggregateOnly: effective.aggregateOnly,
            contactDetail: effective.source.contactDetail,
        },
        readOnly: true,
    };
}

export async function runSavedPrompt(companyId, userId, sessionId, promptId, user) {
    const prompt = await touchSavedPrompt(companyId, userId, promptId, user);
    return askQuestion(companyId, userId, sessionId, { question: prompt.promptText }, user);
}

export async function exportSession(companyId, userId, sessionId, user) {
    if (!hasAssistant(user, PERMS.export)) {
        throw new ApiError(403, `Missing permission: ${PERMS.export}`);
    }
    const effective = resolveEffectivePermissions(user);
    if (effective.aggregateOnly) {
        throw new ApiError(403, 'Aggregate-only users cannot export identifiable session content');
    }
    const session = await loadOwnedSession(companyId, sessionId, userId);
    const { listMessages } = await import('./session.service.js');
    const messages = await listMessages(companyId, sessionId, userId, user);
    const payload = {
        session: { id: session._id, title: session.title, mode: session.mode },
        messages: (messages.items || []).map((m) => ({
            role: m.role,
            content: m.content,
            intent: m.intent,
            createdAt: m.createdAt,
            limitations: m.limitations,
        })),
        exportedAt: new Date().toISOString(),
        note: 'Read-only export',
    };
    assertNoSecrets(payload);
    return payload;
}

export function getToolsCatalog(user) {
    assertAsk(user);
    return { tools: listRegisteredTools(), writeToolsRegistered: false };
}

export { validateQueryPlan } from './validator.service.js';
export { validateQueryPlanPayload } from './validator.service.js';
