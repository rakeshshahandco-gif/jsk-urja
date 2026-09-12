import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { assignmentFromToken, assertAdminMayTransfer, normalizeDeviceId } from '../../discovery/agent/agentDevice.util.js';
import { actorUserId, actorUserName, assertCanAccessOwnedRun } from './simpleLeadSearch.ownership.util.js';

function requireSession(companyId, sessionId) {
    if (!companyId) throw new ApiError(400, 'Company context required');
    if (!sessionId) throw new ApiError(400, 'sessionId is required');
}

export async function transferExtractionDevice({
    companyId,
    user,
    sessionId,
    targetDeviceId,
    targetAgentTokenId,
    confirm = false,
}) {
    requireSession(companyId, sessionId);
    if (!confirm) throw new ApiError(400, 'Transfer requires confirmation');

    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    assertCanAccessOwnedRun(user, session);
    assertAdminMayTransfer(user, session);

    const tokenFilter = {
        companyId,
        isActive: true,
        revokedAt: null,
    };
    if (targetAgentTokenId) tokenFilter._id = targetAgentTokenId;
    else if (targetDeviceId) tokenFilter.deviceId = normalizeDeviceId(targetDeviceId);
    else throw new ApiError(400, 'targetDeviceId is required');

    const token = await DiscoveryAgentToken.findOne(tokenFilter);
    if (!token) throw new ApiError(404, 'Target Discovery Agent device was not found');

    const next = assignmentFromToken(token);
    const from = {
        assignedDeviceId: session.assignedDeviceId || '',
        assignedDeviceName: session.assignedDeviceName || '',
        assignedAgentTokenId: session.assignedAgentTokenId ? String(session.assignedAgentTokenId) : '',
    };
    session.assignedAgentTokenId = next.assignedAgentTokenId;
    session.assignedAgentId = '';
    session.assignedDeviceId = next.assignedDeviceId;
    session.assignedDeviceName = next.assignedDeviceName;
    const entry = {
        at: new Date().toISOString(),
        action: 'transfer_extraction_device',
        fromDeviceId: from.assignedDeviceId,
        fromDeviceName: from.assignedDeviceName,
        toDeviceId: next.assignedDeviceId,
        toDeviceName: next.assignedDeviceName,
        toAgentTokenId: next.assignedAgentTokenId ? String(next.assignedAgentTokenId) : '',
        byUserId: actorUserId(user) ? String(actorUserId(user)) : '',
        byUserName: actorUserName(user),
        ownerUserId: session.createdBy ? String(session.createdBy) : '',
        ownerName: session.createdByName || '',
    };
    session.deviceTransferLog = [...(session.deviceTransferLog || []), entry].slice(-50);
    await session.save();

    return {
        sessionId: String(session._id),
        createdBy: session.createdBy ? String(session.createdBy) : null,
        createdByName: session.createdByName || '',
        assignedDeviceId: session.assignedDeviceId,
        assignedDeviceName: session.assignedDeviceName,
        transfer: entry,
    };
}
