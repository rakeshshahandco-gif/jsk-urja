import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertAdminMayTransfer,
    isSafeDeviceTransferStatus,
    pickStartToken,
    queuedSessionFilterForToken,
    tokenMayClaimSession,
} from '../../src/services/dataExtractor/discovery/agent/agentDevice.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../../src');

const now = Date.now();
const online = { lastUsedAt: new Date(now - 5_000) };
const offline = { lastUsedAt: new Date(now - 120_000) };

describe('Discovery Agent user/device binding', () => {
    const jatinToken = {
        _id: 'tok-jatin',
        userId: 'u-jatin',
        createdBy: 'u-jatin',
        deviceId: 'JATIN-PC',
        deviceName: 'JATIN-PC',
        ...online,
    };
    const adminToken = {
        _id: 'tok-admin',
        userId: 'u-admin',
        createdBy: 'u-admin',
        deviceId: 'ADMIN-PC',
        deviceName: 'ADMIN-PC',
        ...online,
    };
    const jatinLaptop = {
        _id: 'tok-jatin-lap',
        userId: 'u-jatin',
        createdBy: 'u-jatin',
        deviceId: 'JATIN-LAPTOP',
        deviceName: 'JATIN-LAPTOP',
        ...offline,
    };
    const jatinSearch = {
        createdBy: 'u-jatin',
        assignedDeviceId: 'JATIN-PC',
        assignedAgentTokenId: 'tok-jatin',
        status: 'queued',
    };

    it('Jatin agent may claim Jatin assigned search and Admin agent may not', () => {
        assert.equal(tokenMayClaimSession(jatinToken, jatinSearch), true);
        assert.equal(tokenMayClaimSession(adminToken, jatinSearch), false);
        assert.equal(tokenMayClaimSession(jatinLaptop, jatinSearch), false);
    });

    it('legacy unassigned session is owner-only', () => {
        const legacy = { createdBy: 'u-jatin', status: 'queued' };
        assert.equal(tokenMayClaimSession(jatinToken, legacy), true);
        assert.equal(tokenMayClaimSession(adminToken, legacy), false);
    });

    it('poll filter is user+device scoped', () => {
        const filter = queuedSessionFilterForToken('co1', jatinToken);
        assert.equal(String(filter.companyId), 'co1');
        assert.equal(filter.status, 'queued');
        assert.ok(filter.$or.some((c) => c.assignedDeviceId === 'JATIN-PC'));
        assert.ok(filter.$or.some((c) => c.assignedAgentTokenId === 'tok-jatin'));
    });

    it('start picker does not guess across offline extra PCs', () => {
        const selected = pickStartToken({
            tokens: [jatinToken, jatinLaptop],
            preferredDeviceId: 'JATIN-PC',
            requireOnline: true,
        });
        assert.equal(selected.reason, 'ok');
        assert.equal(selected.token.deviceId, 'JATIN-PC');
        const offlinePick = pickStartToken({
            tokens: [jatinToken, jatinLaptop],
            preferredDeviceId: 'JATIN-LAPTOP',
            requireOnline: true,
        });
        assert.equal(offlinePick.reason, 'offline');
        const multi = pickStartToken({
            tokens: [{ ...jatinLaptop, ...online }, jatinToken],
            requireOnline: true,
        });
        assert.equal(multi.reason, 'select');
    });

    it('transfer is admin-only and blocked while running', () => {
        const admin = { _id: 'u-admin', roleName: 'admin' };
        const staff = { _id: 'u-jatin', roleName: 'staff' };
        const paused = { autoCollection: { status: 'paused_owner' }, status: 'awaiting_user' };
        const running = { autoCollection: { status: 'running' }, status: 'capturing' };
        assert.equal(isSafeDeviceTransferStatus(paused), true);
        assert.equal(isSafeDeviceTransferStatus(running), false);
        assert.doesNotThrow(() => assertAdminMayTransfer(admin, paused));
        assert.throws(() => assertAdminMayTransfer(staff, paused), /admin/i);
        assert.throws(() => assertAdminMayTransfer(admin, running), /Pause or stop/);
    });

    it('poll and claim controllers pass the agent token', () => {
        const adapter = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/assistedCapture/agentAdapter.service.js'),
            'utf8',
        );
        const controller = fs.readFileSync(
            path.join(srcRoot, 'controllers/assistedCapture.controller.js'),
            'utf8',
        );
        assert.match(adapter, /queuedSessionFilterForToken/);
        assert.match(adapter, /assertTokenMayClaimSession/);
        assert.match(controller, /agentToken:\s*req\.agentToken/);
        assert.match(controller, /pollQueuedSessionId\(companyId,\s*token\)/);
        const start = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js'),
            'utf8',
        );
        assert.match(start, /resolveStartDeviceAssignment/);
        assert.match(start, /assignedDeviceId/);
        const playwright = fs.readFileSync(
            path.join(__dirname, '../../../tools/discovery-agent/src/sources/assistedGoogleCapture.js'),
            'utf8',
        );
        assert.match(playwright, /runAssistedGoogleCapture/);
    });
});
