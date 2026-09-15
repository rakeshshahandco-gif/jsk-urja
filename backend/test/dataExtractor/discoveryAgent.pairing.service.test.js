import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { DiscoveryAgentToken } from '../../src/models/discoveryAgentToken.model.js';
import {
    createPairingSession,
    exchangePairingCode,
} from '../../src/services/dataExtractor/discovery/agent/agentPairing.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `DA-PAIR-${Date.now()}`;

describe('Discovery Agent one-click pairing', () => {
    let company;
    let user;

    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        await mongoose.connect(MONGO_URI);
        company = await Company.create({
            companyName: `DA Pair ${TAG}`,
            isActive: true,
            moduleGuardEnabled: false,
            enabledModules: ['crm', 'data_extractor'],
        });
        user = await User.create({
            name: 'JATIN THAKKAR',
            username: `da.pair.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
            email: `da.pair.${TAG}@t.local`.toLowerCase(),
            password: 'TestPass123!',
            roleName: 'staff',
            allowLogin: true,
            isActive: true,
            companyAccessConfigured: false,
        });
    });

    after(async () => {
        await DiscoveryAgentToken.deleteMany({ userId: user?._id });
        await User.deleteOne({ _id: user?._id });
        await Company.deleteOne({ _id: company?._id });
        await mongoose.disconnect();
    });

    it('exchanges a one-time pairing code and reuses the same installId', async () => {
        const first = await createPairingSession({
            companyId: company._id,
            userId: user._id,
            userName: 'JATIN THAKKAR',
        });
        assert.match(first.pairingCode, /^jskpair_/);
        const a = await exchangePairingCode({
            pairingCode: first.pairingCode,
            installId: 'inst-jatin-pc-1',
            hostname: 'JATIN-PC',
            deviceName: 'JATIN-PC',
            agentVersion: '1.0.0',
        });
        assert.match(a.token, /^jskdisc_/);
        assert.equal(a.deviceName, 'JATIN-PC');
        assert.equal(a.reused, false);

        await assert.rejects(
            () => exchangePairingCode({
                pairingCode: first.pairingCode,
                installId: 'inst-jatin-pc-1',
                hostname: 'JATIN-PC',
            }),
            /Invalid or expired pairing code/,
        );

        const second = await createPairingSession({
            companyId: company._id,
            userId: user._id,
            userName: 'JATIN THAKKAR',
        });
        const b = await exchangePairingCode({
            pairingCode: second.pairingCode,
            installId: 'inst-jatin-pc-1',
            hostname: 'JATIN-PC',
            deviceName: 'JATIN-PC',
        });
        assert.equal(b.reused, true);
        assert.equal(b.deviceId, a.deviceId);
        assert.notEqual(b.token, a.token);

        const active = await DiscoveryAgentToken.find({ userId: user._id, isActive: true, revokedAt: null });
        assert.equal(active.length, 1);
    });

    it('reuses a same-user hostname when installId was missing', async () => {
        await DiscoveryAgentToken.deleteMany({ userId: user._id });
        await DiscoveryAgentToken.create({
            companyId: company._id,
            name: 'JATIN',
            tokenHash: 'x'.repeat(64),
            tokenPrefix: 'jskdisc_old',
            createdBy: user._id,
            userId: user._id,
            userName: 'JATIN THAKKAR',
            deviceId: 'pc-legacy-jatin',
            deviceName: 'JATIN',
            hostname: 'JATIN-PC',
            isActive: true,
        });
        const session = await createPairingSession({
            companyId: company._id,
            userId: user._id,
            userName: 'JATIN THAKKAR',
        });
        const paired = await exchangePairingCode({
            pairingCode: session.pairingCode,
            installId: 'inst-jatin-repair',
            hostname: 'JATIN-PC',
            deviceName: 'JATIN-PC',
        });
        assert.equal(paired.reused, true);
        assert.equal(paired.deviceId, 'pc-legacy-jatin');
    });
});
