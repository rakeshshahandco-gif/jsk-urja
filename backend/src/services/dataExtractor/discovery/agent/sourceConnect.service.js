import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { LOCAL_PAIR_ORIGIN } from './agentPairing.service.js';
import {
    mergeSourceMap,
    normalizeExtractionSource,
    sanitizeSourceStatusPatch,
} from './sourceConnect.util.js';
import { isAgentTokenOnline } from './agentDevice.util.js';

function notPairing(query) {
    return {
        ...query,
        $or: [{ 'metadata.kind': { $exists: false } }, { 'metadata.kind': { $ne: 'pairing' } }],
    };
}

export async function findUserAgentToken(companyId, userId) {
    if (!companyId || !userId) return null;
    return DiscoveryAgentToken.findOne(notPairing({
        companyId,
        userId,
        isActive: true,
        revokedAt: null,
    })).sort({ lastHeartbeatAt: -1, updatedAt: -1 });
}

export async function requestSourceConnect({ companyId, userId, source }) {
    const src = normalizeExtractionSource(source);
    if (!src) throw new ApiError(400, 'Unsupported source');
    const token = await findUserAgentToken(companyId, userId);
    if (!token) {
        throw new ApiError(409, 'Connect This PC first. JSK Extraction Agent is not paired for this user.');
    }
    if (!isAgentTokenOnline(token, Date.now())) {
        throw new ApiError(409, 'Start / Reconnect JSK Extraction Agent on this PC, then Connect Facebook or Instagram.');
    }
    token.metadata = {
        ...(token.metadata && typeof token.metadata === 'object' ? token.metadata : {}),
        sources: mergeSourceMap(token.metadata?.sources, src, { status: 'connecting' }),
    };
    await token.save();
    return {
        localConnectRequired: true,
        source: src,
        userId: String(userId),
        deviceId: token.deviceId || '',
        deviceName: token.deviceName || token.hostname || '',
        localPairOrigin: LOCAL_PAIR_ORIGIN,
        status: 'connecting',
    };
}

export async function requestSourceLogout({ companyId, userId, source }) {
    const src = normalizeExtractionSource(source);
    if (!src) throw new ApiError(400, 'Unsupported source');
    const token = await findUserAgentToken(companyId, userId);
    if (token) {
        token.metadata = {
            ...(token.metadata && typeof token.metadata === 'object' ? token.metadata : {}),
            sources: mergeSourceMap(token.metadata?.sources, src, { status: 'disconnected', note: 'Logged out' }),
        };
        await token.save();
    }
    return {
        localLogoutRequired: true,
        source: src,
        userId: String(userId || ''),
        localPairOrigin: LOCAL_PAIR_ORIGIN,
        status: 'disconnected',
    };
}

export async function reportSourceStatus({ companyId, agentToken, source, patch }) {
    const src = normalizeExtractionSource(source);
    if (!src) throw new ApiError(400, 'Unsupported source');
    const safe = sanitizeSourceStatusPatch(patch);
    const token = await DiscoveryAgentToken.findOne({
        _id: agentToken._id,
        companyId,
        isActive: true,
        revokedAt: null,
    });
    if (!token) throw new ApiError(401, 'Discovery agent token rejected');
    token.metadata = {
        ...(token.metadata && typeof token.metadata === 'object' ? token.metadata : {}),
        sources: mergeSourceMap(token.metadata?.sources, src, {
            ...safe,
            lastSeen: new Date().toISOString(),
        }),
    };
    await token.save();
    return {
        source: src,
        status: token.metadata.sources?.[src]?.status || 'disconnected',
        deviceId: token.deviceId || '',
        userId: token.userId ? String(token.userId) : null,
    };
}

export function sourceStatusFromToken(token, source) {
    const src = normalizeExtractionSource(source);
    const row = token?.metadata?.sources?.[src];
    if (!row || typeof row !== 'object') {
        return { status: 'disconnected', connectedAt: null, lastVerifiedAt: null, note: '' };
    }
    return {
        status: row.status || 'disconnected',
        connectedAt: row.connectedAt || null,
        lastVerifiedAt: row.lastVerifiedAt || null,
        lastSeen: row.lastSeen || null,
        note: row.note || '',
    };
}
