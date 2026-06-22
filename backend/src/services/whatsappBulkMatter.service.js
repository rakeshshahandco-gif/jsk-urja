import WhatsAppBulkMatter from '../models/whatsappBulkMatter.model.js';
import { ApiError } from '../utils/ApiError.js';

export async function listMatters(companyId, { activeOnly = false } = {}) {
    const q = { companyId };
    if (activeOnly) q.isActive = true;
    return WhatsAppBulkMatter.find(q).sort({ updatedAt: -1 }).lean();
}

export async function getMatter(companyId, id) {
    const doc = await WhatsAppBulkMatter.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Matter not found');
    return doc;
}

export async function createMatter(companyId, body, userId) {
    return WhatsAppBulkMatter.create({ ...body, companyId, createdBy: userId, updatedBy: userId });
}

export async function updateMatter(companyId, id, body, userId) {
    const doc = await WhatsAppBulkMatter.findOneAndUpdate(
        { _id: id, companyId },
        { ...body, updatedBy: userId },
        { new: true },
    );
    if (!doc) throw new ApiError(404, 'Matter not found');
    return doc;
}

export async function touchMatterUsage(companyId, matterId) {
    if (!matterId) return;
    await WhatsAppBulkMatter.updateOne(
        { _id: matterId, companyId },
        { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } },
    );
}

export async function deleteMatter(companyId, id) {
    const doc = await WhatsAppBulkMatter.findOneAndDelete({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Matter not found');
    return doc;
}
