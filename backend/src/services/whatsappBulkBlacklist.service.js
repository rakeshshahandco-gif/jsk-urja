import WhatsAppBulkBlacklist from '../models/whatsappBulkBlacklist.model.js';
import { normalizeMobile } from './whatsappBulkRecipient.service.js';
import { ApiError } from '../utils/ApiError.js';

export async function listBlacklist(companyId) {
    return WhatsAppBulkBlacklist.find({ companyId }).sort({ updatedAt: -1 }).lean();
}

export async function addBlacklist(companyId, payload, userId) {
    const mobile = normalizeMobile(payload.mobile);
    if (!mobile) throw new ApiError(400, 'Invalid mobile number');
    return WhatsAppBulkBlacklist.findOneAndUpdate(
        { companyId, mobile },
        { ...payload, mobile, companyId, isActive: true, createdBy: userId },
        { upsert: true, new: true },
    );
}

export async function removeBlacklist(companyId, id) {
    const doc = await WhatsAppBulkBlacklist.findOneAndDelete({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Blacklist entry not found');
    return doc;
}
