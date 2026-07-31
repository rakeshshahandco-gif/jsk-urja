import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listSessions, createSession, getSession, updateSession, deleteSession,
    archiveSession, clearSessionContext, listMessages, listSavedPrompts,
    createSavedPrompt, updateSavedPrompt, deleteSavedPrompt, listAudit,
} from '../services/dataExtractor/salesAssistant/session.service.js';
import {
    askQuestion, runSavedPrompt, exportSession, getToolsCatalog, validateQueryPlanPayload,
} from '../services/dataExtractor/salesAssistant/ask.service.js';
import {
    getSettingsForUser, saveAssistantSettings, getAssistantSettings,
} from '../services/dataExtractor/salesAssistant/settings.service.js';
import { sanitizeError } from '../services/dataExtractor/salesAssistant/normalize.util.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null
        || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function uid(req) {
    return req.user?.id || req.user?._id;
}

export const listSessionsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listSessions(req.companyId, uid(req), req.user, req.query);
    res.send(new ApiResponse(200, data, 'Assistant sessions'));
});

export const createSessionHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createSession(req.companyId, uid(req), req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Session created'));
});

export const getSessionHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSession(req.companyId, req.params.id, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Assistant session'));
});

export const updateSessionHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await updateSession(req.companyId, req.params.id, uid(req), req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Session updated'));
});

export const deleteSessionHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await deleteSession(req.companyId, req.params.id, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Session deleted'));
});

export const archiveSessionHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await archiveSession(req.companyId, req.params.id, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Session archived'));
});

export const clearContextHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await clearSessionContext(req.companyId, req.params.id, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Session context cleared'));
});

export const askHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    try {
        const data = await askQuestion(req.companyId, uid(req), req.params.id, req.body || {}, req.user);
        res.send(new ApiResponse(200, data, 'Assistant answer'));
    } catch (err) {
        throw new ApiError(err.statusCode || 500, sanitizeError(err));
    }
});

export const messagesHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listMessages(req.companyId, req.params.id, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Session messages'));
});

export const exportSessionHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportSession(req.companyId, uid(req), req.params.id, req.user);
    res.send(new ApiResponse(200, data, 'Session export'));
});

export const listPromptsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listSavedPrompts(req.companyId, uid(req), req.user);
    res.send(new ApiResponse(200, data, 'Saved prompts'));
});

export const createPromptHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createSavedPrompt(req.companyId, uid(req), req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Saved prompt created'));
});

export const updatePromptHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await updateSavedPrompt(req.companyId, uid(req), req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Saved prompt updated'));
});

export const deletePromptHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await deleteSavedPrompt(req.companyId, uid(req), req.params.id, req.user);
    res.send(new ApiResponse(200, data, 'Saved prompt deleted'));
});

export const runPromptHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await runSavedPrompt(req.companyId, uid(req), req.body?.sessionId || req.query.sessionId, req.params.id, req.user);
    res.send(new ApiResponse(200, data, 'Saved prompt executed (ask only)'));
});

export const toolsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = getToolsCatalog(req.user);
    res.send(new ApiResponse(200, data, 'Read-only tool registry'));
});

export const getSettingsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSettingsForUser(req.companyId, req.user);
    res.send(new ApiResponse(200, data, 'Assistant settings'));
});

export const saveSettingsHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveAssistantSettings(req.companyId, uid(req), req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Assistant settings saved'));
});

export const auditHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listAudit(req.companyId, uid(req), req.user, req.query);
    res.send(new ApiResponse(200, data, 'Assistant audit'));
});

export const validatePlanHandler = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const settings = await getAssistantSettings(req.companyId);
    const data = validateQueryPlanPayload(req.body || {}, settings);
    res.send(new ApiResponse(200, data, 'Query plan validated'));
});
