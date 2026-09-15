import crypto from 'crypto';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    hostnameMatchKey,
    newDeviceId,
    normalizeDeviceName,
    normalizeHostname,
    normalizeInstallId,
} from './agentDevice.util.js';

export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const LOCAL_PAIR_PORT = 17373;
export const LOCAL_PAIR_ORIGIN = `http://127.0.0.1:${LOCAL_PAIR_PORT}`;

function hashSecret(plain) {
    return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function generatePairingCode() {
    return 'jskpair_' + crypto.randomBytes(8).toString('hex');
}

function generatePlainToken() {
    return 'jskdisc_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Pairing codes live on existing discovery_agent_tokens (no new collection).
 * Atlas/dev DBs already at the collection cap cannot create discovery_agent_pairings.
 */
export async function createPairingSession({ companyId, userId, userName = '' }) {
    if (!companyId || !userId) {
        throw new ApiError(400, 'Pairing requires a signed-in user and company');
    }
    await DiscoveryAgentToken.deleteMany({
        companyId,
        userId,
        'metadata.kind': 'pairing',
        $or: [
            { expiresAt: { $lt: new Date() } },
            { revokedAt: { $ne: null } },
        ],
    });
    const pairingCode = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    await DiscoveryAgentToken.create({
        companyId,
        name: '__pairing__',
        tokenHash: hashSecret(pairingCode),
        tokenPrefix: pairingCode.slice(0, 12),
        createdBy: userId,
        userId,
        userName: String(userName || '').trim().slice(0, 160),
        isActive: false,
        expiresAt,
        metadata: { kind: 'pairing', usedAt: null },
    });
    return {
        pairingCode,
        expiresAt,
        expiresInSec: Math.round(PAIRING_TTL_MS / 1000),
        localPairOrigin: LOCAL_PAIR_ORIGIN,
    };
}

async function findReusableToken({ companyId, userId, installId, hostname }) {
    const iid = normalizeInstallId(installId);
    const notPairing = { $or: [{ 'metadata.kind': { $exists: false } }, { 'metadata.kind': { $ne: 'pairing' } }] };
    if (iid) {
        const byInstall = await DiscoveryAgentToken.findOne({
            companyId,
            userId,
            installId: iid,
            isActive: true,
            revokedAt: null,
            ...notPairing,
        }).sort({ updatedAt: -1 });
        if (byInstall) return byInstall;
    }
    const hostKey = hostnameMatchKey(hostname);
    if (!hostKey) return null;
    const candidates = await DiscoveryAgentToken.find({
        companyId,
        userId,
        isActive: true,
        revokedAt: null,
        ...notPairing,
    }).sort({ updatedAt: -1 }).lean(false);
    const sameHost = candidates.filter((t) => hostnameMatchKey(t.hostname) === hostKey);
    if (sameHost.length === 1) {
        const row = sameHost[0];
        if (!row.installId || row.installId === iid) return row;
    }
    return null;
}

export async function exchangePairingCode({
    pairingCode,
    installId,
    hostname = '',
    deviceName = '',
    agentVersion = '',
}) {
    const plainCode = String(pairingCode || '').trim();
    if (!plainCode.startsWith('jskpair_')) {
        throw new ApiError(401, 'Invalid or expired pairing code');
    }
    const iid = normalizeInstallId(installId);
    if (!iid) throw new ApiError(400, 'installId is required');

    const session = await DiscoveryAgentToken.findOne({
        tokenHash: hashSecret(plainCode),
        'metadata.kind': 'pairing',
    });
    if (!session || session.metadata?.usedAt || session.revokedAt) {
        throw new ApiError(401, 'Invalid or expired pairing code');
    }
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
        throw new ApiError(401, 'Invalid or expired pairing code');
    }

    const host = normalizeHostname(hostname);
    const displayName = normalizeDeviceName(deviceName || host) || 'Windows-PC';
    const existing = await findReusableToken({
        companyId: session.companyId,
        userId: session.userId,
        installId: iid,
        hostname: host,
    });

    const plainToken = generatePlainToken();
    const tokenHash = hashSecret(plainToken);
    const tokenPrefix = plainToken.slice(0, 12);
    let doc = existing;
    let reused = Boolean(existing);

    if (existing) {
        existing.tokenHash = tokenHash;
        existing.tokenPrefix = tokenPrefix;
        existing.installId = iid;
        existing.hostname = host;
        existing.deviceName = displayName;
        existing.name = displayName;
        existing.userName = session.userName || existing.userName;
        existing.agentVersion = String(agentVersion || '').slice(0, 40);
        existing.isActive = true;
        existing.revokedAt = null;
        existing.expiresAt = null;
        if (!existing.deviceId) existing.deviceId = newDeviceId();
        await existing.save();
        doc = existing;
    } else {
        doc = await DiscoveryAgentToken.create({
            companyId: session.companyId,
            name: displayName,
            tokenHash,
            tokenPrefix,
            createdBy: session.userId,
            userId: session.userId,
            userName: session.userName || '',
            deviceId: newDeviceId(),
            installId: iid,
            deviceName: displayName,
            hostname: host,
            agentVersion: String(agentVersion || '').slice(0, 40),
            expiresAt: null,
            isActive: true,
        });
    }

    session.metadata = { ...(session.metadata || {}), kind: 'pairing', usedAt: new Date() };
    session.revokedAt = new Date();
    session.isActive = false;
    await session.save();

    return {
        token: plainToken,
        deviceId: doc.deviceId,
        deviceName: doc.deviceName,
        hostname: doc.hostname,
        userId: String(doc.userId || session.userId),
        userName: doc.userName || session.userName || '',
        companyId: String(doc.companyId || session.companyId),
        agentTokenId: String(doc._id),
        reused,
        warning: 'Permanent device credential is for the local agent only. Do not display or log it.',
    };
}
