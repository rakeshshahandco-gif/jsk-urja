import { ApiError } from '../../../utils/ApiError.js';
import { PilotFeedback } from '../../../models/pilotFeedback.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './pilotProgram.service.js';

function localSentiment(rating) {
    const r = Number(rating || 3);
    if (r >= 4) return 'POSITIVE';
    if (r <= 2) return 'NEGATIVE';
    return 'NEUTRAL';
}

export async function listFeedback(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotFeedback.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createFeedback(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.feedback_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const rating = Number(safe.rating || 3);
    const doc = await PilotFeedback.create({
        companyId,
        pilotProgramId: program._id,
        source: safe.source || 'PILOT_USER',
        cohortId: safe.cohortId || null,
        industry: safe.industry || '',
        module: safe.module || '',
        feature: safe.feature || '',
        category: safe.category || 'Usability',
        rating,
        comment: assertSafeText(safe.comment || '', 'comment'),
        evidenceRefs: safe.evidenceRefs || [],
        priority: safe.priority || 'MEDIUM',
        sentiment: localSentiment(rating),
        actionRequired: !!safe.actionRequired,
        status: 'OPEN',
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'FEEDBACK_CREATE', 'PilotFeedback', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}