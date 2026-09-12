/**
 * Simple Lead Search ownership + safe delete contracts (no DB posting).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertCanAccessOwnedRun,
    assertCanDeleteRunData,
    isLiveExtractionSession,
    isPausedExtractionSession,
    isActivelyCollectingSession,
    ownerMongoFilter,
    isDataExtractorAdmin,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.ownership.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../../src');

describe('Simple Lead Search ownership', () => {
    const jatin = { _id: 'u-jatin', name: 'Jatin Thakker', roleName: 'staff' };
    const other = { _id: 'u-raj', name: 'Rajeshree', roleName: 'staff' };
    const admin = { _id: 'u-admin', name: 'SYSTEM ADMIN', roleName: 'admin' };
    const jatinSession = { createdBy: 'u-jatin', createdByName: 'Jatin Thakker', status: 'completed' };

    it('normal user cannot open another user session', () => {
        assert.throws(() => assertCanAccessOwnedRun(other, jatinSession), /belongs to another user/);
        assert.doesNotThrow(() => assertCanAccessOwnedRun(jatin, jatinSession));
    });

    it('admin may monitor without being the owner', () => {
        const access = assertCanAccessOwnedRun(admin, jatinSession);
        assert.equal(access.monitoring, true);
        assert.equal(isDataExtractorAdmin(admin), true);
    });

    it('list filter is createdBy for staff and empty for admin All', () => {
        const own = ownerMongoFilter(jatin);
        assert.equal(String(own.createdBy), 'u-jatin');
        assert.deepEqual(ownerMongoFilter(admin, { scope: 'all' }), {});
    });

    it('live running/processing sessions cannot be treated as deletable', () => {
        const running = { createdBy: 'u-jatin', status: 'capturing', autoCollection: { status: 'running' } };
        const paused = { createdBy: 'u-jatin', status: 'capturing', autoCollection: { status: 'paused_owner' } };
        assert.equal(isLiveExtractionSession(running), true);
        assert.equal(isLiveExtractionSession(paused), true);
        assert.equal(isActivelyCollectingSession(running), true);
        assert.equal(isActivelyCollectingSession(paused), false);
        assert.equal(isPausedExtractionSession(paused), true);
        assert.throws(() => assertCanDeleteRunData(jatin, running), /Stop extraction before deleting data/);
        assert.doesNotThrow(() => assertCanDeleteRunData(jatin, paused));
        assert.throws(() => assertCanDeleteRunData(other, paused), /belongs to another user/);
        assert.equal(isLiveExtractionSession({ status: 'completed', autoCollection: { status: 'completed' } }), false);
        assert.equal(isLiveExtractionSession({ status: 'cancelled', autoCollection: { status: 'running' } }), false);
        assert.equal(isLiveExtractionSession({ status: 'capturing', autoCollection: { status: 'running', ownerStoppedAt: new Date() } }), false);
        assert.equal(isLiveExtractionSession({ status: 'completed', dataRetentionStatus: 'DATA_DELETED' }), false);
    });

    it('start path no longer cancels every company session', () => {
        const sessionSrc = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/assistedCapture/session.service.js'),
            'utf8',
        );
        assert.match(sessionSrc, /createdBy:\s*actorId/);
        const startFn = sessionSrc.slice(sessionSrc.indexOf('if (!isSocialSource)'));
        assert.match(startFn, /createdBy:\s*actorId/);
    });

    it('campaign reuse is owner-scoped', () => {
        const src = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/searchCampaign.service.js'),
            'utf8',
        );
        assert.match(src, /createdBy:\s*ownerId/);
    });

    it('HTTP session routes require owner middleware', () => {
        const routes = fs.readFileSync(path.join(srcRoot, 'routes/v1/dataExtractor.routes.js'), 'utf8');
        assert.match(routes, /assertSimpleLeadSearchSessionAccess/);
        assert.match(routes, /delete-data/);
        const controller = fs.readFileSync(path.join(srcRoot, 'controllers/simpleLeadSearch.controller.js'), 'utf8');
        assert.match(controller, /includeDeleted:\s*req\.query\?\.includeDeleted/);
    });

    it('start binds the run to the actor device and poll is token-filtered', () => {
        const start = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js'),
            'utf8',
        );
        assert.match(start, /resolveStartDeviceAssignment/);
        const adapter = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/assistedCapture/agentAdapter.service.js'),
            'utf8',
        );
        assert.match(adapter, /tokenMayClaimSession|assertTokenMayClaimSession/);
    });

    it('paused delete finalizes the run before removing heavy data', () => {
        const src = fs.readFileSync(
            path.join(srcRoot, 'services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.deleteRunData.service.js'),
            'utf8',
        );
        assert.match(src, /isPausedExtractionSession/);
        assert.match(src, /ownerStopPersistentRun/);
        assert.match(src, /delete_run_data/);
        assert.doesNotMatch(src, /Lead\.deleteMany|Customer\.deleteMany/);
    });
});
