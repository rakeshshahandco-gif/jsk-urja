import { LeadActivity } from '../models/leadActivity.model.js';

export async function logActivity({ leadId, type, payload = {}, userId }) {
    return LeadActivity.create({ leadId, type, payload, userId, at: new Date() });
}

export async function getActivities(leadId, { limit = 200 } = {}) {
    return LeadActivity.find({ leadId })
        .populate('userId', 'name email')
        .sort({ at: -1 })
        .limit(limit);
}
