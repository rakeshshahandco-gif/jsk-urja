import crypto from 'crypto';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';

function hashToken(plain) {
    return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function generatePlainToken() {
    return 'jskdisc_' + crypto.randomBytes(32).toString('hex');
}

export async function createAgentToken({ companyId, userId, name = 'Local Discovery Agent', expiresInDays = 90 }) {
    const plain = generatePlainToken();
    const tokenHash = hashToken(plain);
    const tokenPrefix = plain.slice(0, 12);
    const expiresAt = expiresInDays
        ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
        : null;
    const doc = await DiscoveryAgentToken.create({
        companyId,
        name: String(name || 'Local Discovery Agent').slice(0, 120),
        tokenHash,
        tokenPrefix,
        createdBy: userId,
        expiresAt,
        isActive: true,
    });
    return {
        id: String(doc._id),
        name: doc.name,
        tokenPrefix: doc.tokenPrefix,
        expiresAt: doc.expiresAt,
        token: plain,
        warning: 'Copy this token now. It will not be shown again. Do not commit or paste into chat logs.',
    };
}

export async function listAgentTokens(companyId) {
    const rows = await DiscoveryAgentToken.find({ companyId })
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
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
    }));
}

export async function revokeAgentToken(companyId, tokenId) {
    const doc = await DiscoveryAgentToken.findOne({ _id: tokenId, companyId });
    if (!doc) throw new ApiError(404, 'Agent token not found');
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
