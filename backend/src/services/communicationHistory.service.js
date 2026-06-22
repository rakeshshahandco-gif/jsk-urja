import CommunicationHistory from '../models/communicationHistory.model.js';

export async function recordCommunication(companyId, payload) {
    return CommunicationHistory.create({
        companyId,
        ...payload,
    });
}

export async function listHistory(companyId, { channel, status, limit = 100, skip = 0, recipientAddress } = {}) {
    const q = { companyId };
    if (channel) q.channel = channel;
    if (status) q.status = status;
    if (recipientAddress) q.recipientAddress = recipientAddress.toLowerCase();
    const [results, total] = await Promise.all([
        CommunicationHistory.find(q).sort({ sentAt: -1 }).skip(skip).limit(limit).lean(),
        CommunicationHistory.countDocuments(q),
    ]);
    return { results, total };
}

export async function getHistoryEntry(companyId, id) {
    return CommunicationHistory.findOne({ _id: id, companyId }).lean();
}
