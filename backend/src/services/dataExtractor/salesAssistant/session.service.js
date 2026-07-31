import mongoose from 'mongoose';
import { AiSalesAssistantSession } from '../../../models/aiSalesAssistantSession.model.js';
import { AiSalesAssistantMessage } from '../../../models/aiSalesAssistantMessage.model.js';
import { AiSalesAssistantSavedPrompt } from '../../../models/aiSalesAssistantSavedPrompt.model.js';
import { AiSalesAssistantQueryAudit } from '../../../models/aiSalesAssistantQueryAudit.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertNoSecrets, rejectTenantOverrides, sanitizeUserText } from './normalize.util.js';
import {
    assertView, assertAsk, assertSavedPrompts, assertAudit, canManageSharedPrompts, hasAssistant,
} from './permissions.util.js';
import { PERMS, SUGGESTED_QUESTIONS } from './constants.js';
import { getAssistantSettings } from './settings.service.js';

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

async function loadOwnedSession(companyId, sessionId, userId) {
    const id = oid(sessionId);
    if (!id) throw new ApiError(400, 'Invalid session id');
    const session = await AiSalesAssistantSession.findOne({
        _id: id,
        companyId,
        isDeleted: { $ne: true },
    }).lean();
    if (!session) throw new ApiError(404, 'Session not found');
    if (String(session.companyId) !== String(companyId)) throw new ApiError(404, 'Session not found');
    if (String(session.ownerUserId) !== String(userId)) throw new ApiError(404, 'Session not found');
    return session;
}

export async function listSessions(companyId, userId, user, query = {}) {
    assertView(user);
    rejectTenantOverrides(query);
    const status = query.status || 'ACTIVE';
    const rows = await AiSalesAssistantSession.find({
        companyId,
        ownerUserId: userId,
        isDeleted: { $ne: true },
        ...(status !== 'ALL' ? { status } : {}),
    }).sort({ updatedAt: -1 }).limit(100).lean();
    return { items: rows, suggestedQuestions: SUGGESTED_QUESTIONS };
}

export async function createSession(companyId, userId, body = {}, user = null) {
    assertAsk(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const settings = await getAssistantSettings(companyId);
    const doc = await AiSalesAssistantSession.create({
        companyId,
        ownerUserId: userId,
        title: sanitizeUserText(body.title || 'New conversation', 120),
        mode: body.mode || settings.mode || 'HYBRID',
        context: { filters: {}, lastIntent: '', lastResultRefs: [], selectedRecordRefs: [], mode: body.mode || settings.mode },
        createdBy: userId,
        updatedBy: userId,
    });
    return doc.toObject();
}

export async function getSession(companyId, sessionId, userId, user) {
    assertView(user);
    return loadOwnedSession(companyId, sessionId, userId);
}

export async function updateSession(companyId, sessionId, userId, body = {}, user = null) {
    assertAsk(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    await loadOwnedSession(companyId, sessionId, userId);
    const updates = { updatedBy: userId };
    if (body.title != null) updates.title = sanitizeUserText(body.title, 120);
    if (body.mode != null) updates.mode = body.mode;
    const doc = await AiSalesAssistantSession.findOneAndUpdate(
        { _id: sessionId, companyId, ownerUserId: userId, isDeleted: { $ne: true } },
        { $set: updates },
        { new: true },
    ).lean();
    return doc;
}

export async function deleteSession(companyId, sessionId, userId, user) {
    assertAsk(user);
    await loadOwnedSession(companyId, sessionId, userId);
    await AiSalesAssistantSession.updateOne(
        { _id: sessionId, companyId, ownerUserId: userId },
        { $set: { isDeleted: true, status: 'ARCHIVED', updatedBy: userId } },
    );
    await AiSalesAssistantMessage.updateMany(
        { sessionId, companyId, ownerUserId: userId },
        { $set: { isDeleted: true } },
    );
    return { deleted: true };
}

export async function archiveSession(companyId, sessionId, userId, user) {
    assertAsk(user);
    await loadOwnedSession(companyId, sessionId, userId);
    return AiSalesAssistantSession.findOneAndUpdate(
        { _id: sessionId, companyId, ownerUserId: userId },
        { $set: { status: 'ARCHIVED', archivedAt: new Date(), updatedBy: userId } },
        { new: true },
    ).lean();
}

export async function clearSessionContext(companyId, sessionId, userId, user) {
    assertAsk(user);
    await loadOwnedSession(companyId, sessionId, userId);
    return AiSalesAssistantSession.findOneAndUpdate(
        { _id: sessionId, companyId, ownerUserId: userId },
        {
            $set: {
                status: 'CLEARED',
                context: { filters: {}, lastIntent: '', lastResultRefs: [], selectedRecordRefs: [] },
                updatedBy: userId,
            },
        },
        { new: true },
    ).lean();
}

export async function listMessages(companyId, sessionId, userId, user) {
    assertView(user);
    await loadOwnedSession(companyId, sessionId, userId);
    const items = await AiSalesAssistantMessage.find({
        companyId,
        sessionId,
        ownerUserId: userId,
        isDeleted: { $ne: true },
    }).sort({ createdAt: 1 }).limit(500).lean();
    return { items };
}

export async function appendMessage(companyId, sessionId, userId, payload) {
    assertNoSecrets(payload);
    const settings = await getAssistantSettings(companyId);
    const session = await loadOwnedSession(companyId, sessionId, userId);
    if (session.messageCount >= settings.maximumSessionMessages) {
        throw new ApiError(400, 'Session message limit reached');
    }
    const { contextPatch, ...messageFields } = payload || {};
    const msg = await AiSalesAssistantMessage.create({
        companyId,
        sessionId,
        ownerUserId: userId,
        ...messageFields,
    });
    const set = {
        lastAskedAt: new Date(),
        updatedBy: userId,
        status: 'ACTIVE',
    };
    if (contextPatch && typeof contextPatch === 'object') {
        set.context = { ...(session.context || {}), ...contextPatch };
    }
    await AiSalesAssistantSession.updateOne(
        { _id: sessionId, companyId, ownerUserId: userId },
        { $inc: { messageCount: 1 }, $set: set },
    );
    return msg.toObject();
}

export async function updateSessionContext(companyId, sessionId, userId, contextPatch) {
    const session = await loadOwnedSession(companyId, sessionId, userId);
    const next = { ...(session.context || {}), ...contextPatch };
    assertNoSecrets(next);
    await AiSalesAssistantSession.updateOne(
        { _id: sessionId, companyId, ownerUserId: userId },
        { $set: { context: next, updatedBy: userId } },
    );
    return next;
}

export async function writeAudit(companyId, userId, payload) {
    assertNoSecrets(payload);
    return AiSalesAssistantQueryAudit.create({
        companyId,
        ownerUserId: userId,
        ...payload,
    });
}

export async function listAudit(companyId, userId, user, query = {}) {
    assertAudit(user);
    rejectTenantOverrides(query);
    const q = { companyId, isDeleted: { $ne: true } };
    if (!hasAssistant(user, PERMS.manage) && !hasAssistant(user, PERMS.audit)) {
        q.ownerUserId = userId;
    }
    const items = await AiSalesAssistantQueryAudit.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items };
}

export async function listSavedPrompts(companyId, userId, user) {
    assertSavedPrompts(user);
    const items = await AiSalesAssistantSavedPrompt.find({
        companyId,
        isDeleted: { $ne: true },
        $or: [
            { scope: 'PERSONAL', ownerUserId: userId },
            { scope: 'SHARED' },
        ],
    }).sort({ updatedAt: -1 }).limit(200).lean();
    return { items };
}

export async function createSavedPrompt(companyId, userId, body = {}, user = null) {
    assertSavedPrompts(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const scope = body.scope === 'SHARED' ? 'SHARED' : 'PERSONAL';
    if (scope === 'SHARED' && !canManageSharedPrompts(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage_prompts}`);
    }
    const promptText = sanitizeUserText(body.promptText || body.text || '', 2000);
    if (!promptText) throw new ApiError(400, 'promptText required');
    assertNoSecrets({ promptText });
    const doc = await AiSalesAssistantSavedPrompt.create({
        companyId,
        ownerUserId: userId,
        title: sanitizeUserText(body.title || promptText.slice(0, 60), 120),
        promptText,
        scope,
        tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
        createdBy: userId,
        updatedBy: userId,
    });
    return doc.toObject();
}

export async function updateSavedPrompt(companyId, userId, id, body = {}, user = null) {
    assertSavedPrompts(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const _id = oid(id);
    const existing = await AiSalesAssistantSavedPrompt.findOne({ _id, companyId, isDeleted: { $ne: true } }).lean();
    if (!existing) throw new ApiError(404, 'Saved prompt not found');
    if (existing.scope === 'SHARED' && !canManageSharedPrompts(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage_prompts}`);
    }
    if (existing.scope === 'PERSONAL' && String(existing.ownerUserId) !== String(userId)) {
        throw new ApiError(404, 'Saved prompt not found');
    }
    const updates = { updatedBy: userId };
    if (body.title != null) updates.title = sanitizeUserText(body.title, 120);
    if (body.promptText != null) {
        updates.promptText = sanitizeUserText(body.promptText, 2000);
        assertNoSecrets({ promptText: updates.promptText });
    }
    return AiSalesAssistantSavedPrompt.findOneAndUpdate(
        { _id, companyId },
        { $set: updates },
        { new: true },
    ).lean();
}

export async function deleteSavedPrompt(companyId, userId, id, user) {
    assertSavedPrompts(user);
    const _id = oid(id);
    const existing = await AiSalesAssistantSavedPrompt.findOne({ _id, companyId, isDeleted: { $ne: true } }).lean();
    if (!existing) throw new ApiError(404, 'Saved prompt not found');
    if (existing.scope === 'SHARED' && !canManageSharedPrompts(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage_prompts}`);
    }
    if (existing.scope === 'PERSONAL' && String(existing.ownerUserId) !== String(userId)) {
        throw new ApiError(404, 'Saved prompt not found');
    }
    await AiSalesAssistantSavedPrompt.updateOne({ _id, companyId }, { $set: { isDeleted: true, updatedBy: userId } });
    return { deleted: true };
}

export async function touchSavedPrompt(companyId, userId, id, user) {
    assertSavedPrompts(user);
    const _id = oid(id);
    const existing = await AiSalesAssistantSavedPrompt.findOne({
        _id,
        companyId,
        isDeleted: { $ne: true },
        $or: [{ scope: 'SHARED' }, { ownerUserId: userId }],
    }).lean();
    if (!existing) throw new ApiError(404, 'Saved prompt not found');
    await AiSalesAssistantSavedPrompt.updateOne(
        { _id, companyId },
        { $inc: { useCount: 1 }, $set: { lastUsedAt: new Date() } },
    );
    return existing;
}

export { loadOwnedSession };
