import EmailTemplate from '../models/emailTemplate.model.js';
import { ApiError } from '../utils/ApiError.js';
import { validateSendContentPayload } from './emailBulkAttachment.service.js';

export async function listTemplates(companyId, { activeOnly = false } = {}) {
    const q = { companyId };
    if (activeOnly) q.isActive = true;
    return EmailTemplate.find(q).sort({ updatedAt: -1 }).lean();
}

export async function getTemplate(companyId, id) {
    const doc = await EmailTemplate.findOne({ _id: id, companyId }).lean();
    if (!doc) throw new ApiError(404, 'Template not found');
    return doc;
}

export async function createTemplate(companyId, body, userId) {
    validateSendContentPayload({
        sendContentType: body.sendContentType || 'text_only',
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: body.bodyHtml,
        attachments: body.attachments || [],
    });
    return EmailTemplate.create({
        ...body,
        companyId,
        createdBy: userId,
        updatedBy: userId,
    });
}

export async function updateTemplate(companyId, id, body, userId) {
    const existing = await EmailTemplate.findOne({ _id: id, companyId });
    if (!existing) throw new ApiError(404, 'Template not found');
    const merged = { ...existing.toObject(), ...body };
    validateSendContentPayload({
        sendContentType: merged.sendContentType || 'text_only',
        subject: merged.subject,
        bodyText: merged.bodyText,
        bodyHtml: merged.bodyHtml,
        attachments: merged.attachments || [],
    });
    Object.assign(existing, body, { updatedBy: userId });
    await existing.save();
    return existing;
}

export async function deleteTemplate(companyId, id) {
    const doc = await EmailTemplate.findOneAndDelete({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Template not found');
    return doc;
}

export async function touchTemplateUsage(companyId, templateId) {
    await EmailTemplate.updateOne(
        { _id: templateId, companyId },
        { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } },
    );
}
