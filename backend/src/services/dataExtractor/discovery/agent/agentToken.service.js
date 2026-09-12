import crypto from 'crypto';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    fallbackLegacyDeviceId,
    newDeviceId,
    normalizeDeviceId,
    normalizeDeviceName,
    normalizeHostname,
} from './agentDevice.util.js';

function hashToken(plain) {
    return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function generatePlainToken() {
    return 'jskdisc_' + crypto.randomBytes(32).toString('hex');
}

export async function createAgentToken({
    companyId,
    userId,
    userName = '',
    name = 'Local Discovery Agent',
    deviceName = '',
    deviceId = '',
    hostname = '',
    expiresInDays = 90,
}) {
    const plain = generatePlainToken();
    const tokenHash = hashToken(plain);
    const tokenPrefix = plain.slice(0, 12);
    const expiresAt = expiresInDays
        ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
        : null;
    const resolvedDeviceId = normalizeDeviceId(deviceId) || newDeviceId();
    const resolvedDeviceName = normalizeDeviceName(deviceName || name || hostname) || 'Windows-PC';
    const doc = await DiscoveryAgentToken.create({
        companyId,
        name: String(name || resolvedDeviceName || 'Local Discovery Agent').slice(0, 120),
        tokenHash,
        tokenPrefix,
        createdBy: userId,
        userId: userId || null,
        userName: String(userName || '').trim().slice(0, 160),
        deviceId: resolvedDeviceId,
        deviceName: resolvedDeviceName,
        hostname: normalizeHostname(hostname),
        expiresAt,
        isActive: true,
    });
    return {
        id: String(doc._id),
        name: doc.name,
        tokenPrefix: doc.tokenPrefix,
        expiresAt: doc.expiresAt,
        deviceId: doc.deviceId,
        deviceName: doc.deviceName,
        token: plain,
        warning: 'Copy this token now. It will not be shown again. Do not commit or paste into chat logs.',
    };
}

export async function listAgentTokens(companyId, { userId = null, admin = false } = {}) {
    const filter = { companyId };
    if (!admin && userId) {
        filter.$or = [{ userId }, { createdBy: userId }];
    }
    const rows = await DiscoveryAgentToken.find(filter)
        .sort({ createdAt: -1 })
        .select('-tokenHash')
        .lean();
    return rows.map((r) => ({
        id: String(r._id),
        name: r.name,
        tokenPrefix: r.tokenPrefix,
        isActive: r.isActive && !r.revokedAt,
        expiresAt: r.expiresAt,
        lastUsedAt: r.lastUsedAt,
        lastHeartbeatAt: r.lastHeartbeatAt || r.lastUsedAt,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
        userId: r.userId ? String(r.userId) : (r.createdBy ? String(r.createdBy) : null),
        userName: r.userName || '',
        deviceId: r.deviceId || fallbackLegacyDeviceId(r),
        deviceName: r.deviceName || r.hostname || r.name || '',
        hostname: r.hostname || '',
    }));
}

export async function revokeAgentToken(companyId, tokenId, { userId = null, admin = false } = {}) {
    const doc = await DiscoveryAgentToken.findOne({ _id: tokenId, companyId });
    if (!doc) throw new ApiError(404, 'Agent token not found');
    if (!admin) {
        const owner = String(doc.userId || doc.createdBy || '');
        if (!userId || owner !== String(userId)) {
            throw new ApiError(403, 'You can only revoke your own Discovery Agent');
        }
    }
    doc.revokedAt = new Date();
    doc.isActive = false;
    await doc.save();
    return { id: String(doc._id), revoked: true };
}

export async function resolveAgentToken(plainToken) {
    const plain = String(plainToken || '').trim();
    if (!plain || !plain.startsWith('jskdisc_')) {
        throw new ApiError(401, 'Invalid discovery agent token');
    }
    const tokenHash = hashToken(plain);
    const doc = await DiscoveryAgentToken.findOne({ tokenHash });
    if (!doc || !doc.isActive || doc.revokedAt) {
        throw new ApiError(401, 'Discovery agent token rejected');
    }
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
        throw new ApiError(401, 'Discovery agent token expired');
    }
    doc.lastUsedAt = new Date();
    await doc.save();
    return doc;
}
