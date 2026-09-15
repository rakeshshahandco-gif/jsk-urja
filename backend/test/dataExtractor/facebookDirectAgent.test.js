import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
    bindFacebookDirectClaimIdentity,
    tokenMayClaimFacebookDirectJob,
} from '../../src/services/dataExtractor/discovery/agent/agentDevice.util.js';
import {
    isFacebookDirectAgentSearchType,
    isFacebookDirectAgentJob,
} from '../../src/services/dataExtractor/discovery/agent/facebookDirectAgent.service.js';
import { mergeSourceMap } from '../../src/services/dataExtractor/discovery/agent/sourceConnect.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Facebook Direct Agent isolation', () => {
    const companyId = 'c1';
    const rakeshJob = {
        companyId,
        createdBy: 'u-rakesh',
        sourceMode: FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
        assignedDeviceId: 'RAKESH',
        metadata: { source: 'facebook', assignedDeviceId: 'RAKESH', userId: 'u-rakesh' },
    };
    const rakeshToken = {
        _id: 'tok-rakesh',
        companyId,
        userId: 'u-rakesh',
        deviceId: 'RAKESH',
    };

    it('routes only Business/Pages as Direct Agent search type', () => {
        assert.equal(isFacebookDirectAgentSearchType('pages'), true);
        assert.equal(isFacebookDirectAgentSearchType('group_intelligence'), false);
        assert.equal(isFacebookDirectAgentSearchType('groups'), false);
    });

    it('wrong user cannot claim', () => {
        const jatin = { ...rakeshToken, _id: 'tok-jatin', userId: 'u-jatin', deviceId: 'JATIN-PC' };
        assert.equal(tokenMayClaimFacebookDirectJob(jatin, rakeshJob), false);
        assert.equal(tokenMayClaimFacebookDirectJob(rakeshToken, rakeshJob), true);
    });

    it('wrong device cannot claim', () => {
        const otherPc = { ...rakeshToken, deviceId: 'RAKESH-LAPTOP' };
        assert.equal(tokenMayClaimFacebookDirectJob(otherPc, rakeshJob), false);
    });

    it('orphan same-device token inherits the single sibling owner', () => {
        const orphan = { _id: 'tok-orphan', companyId, deviceId: 'RAKESH' };
        const sibling = { _id: 'tok-bound', companyId, userId: 'u-rakesh', deviceId: 'RAKESH' };
        const bound = bindFacebookDirectClaimIdentity(orphan, [sibling]);
        assert.equal(tokenMayClaimFacebookDirectJob(orphan, rakeshJob), false);
        assert.equal(tokenMayClaimFacebookDirectJob(bound, rakeshJob), true);
    });

    it('orphan token does not guess when two sibling owners exist', () => {
        const orphan = { _id: 'tok-orphan', companyId, deviceId: 'RAKESH' };
        const bound = bindFacebookDirectClaimIdentity(orphan, [
            { companyId, userId: 'u-rakesh', deviceId: 'RAKESH' },
            { companyId, userId: 'u-jatin', deviceId: 'RAKESH' },
        ]);
        assert.equal(tokenMayClaimFacebookDirectJob(bound, rakeshJob), false);
    });

    it('identifies facebook_direct_agent jobs', () => {
        assert.equal(isFacebookDirectAgentJob(rakeshJob), true);
        assert.equal(isFacebookDirectAgentJob({ sourceMode: 'google_visible' }), false);
    });

    it('clears stale Logged out note when Facebook is connected', () => {
        const stale = mergeSourceMap({}, 'facebook', { status: 'connected', note: 'Logged out' });
        const next = mergeSourceMap(stale, 'facebook', { status: 'connected' });
        assert.equal(next.facebook.status, 'connected');
        assert.equal(next.facebook.note, '');
    });

    it('service file does not import server Puppeteer', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../../src/services/dataExtractor/discovery/agent/facebookDirectAgent.service.js'),
            'utf8',
        );
        assert.equal(/discoverWithDirectLogin|withSocialBrowser/i.test(src), false);
        assert.equal(/\bpuppeteer\b/i.test(src), false);
        const social = fs.readFileSync(
            path.join(__dirname, '../../src/services/dataExtractor/socialSources/socialExtraction.service.js'),
            'utf8',
        );
        assert.match(social, /isFacebookDirectAgentSearchType/);
        assert.match(social, /startFacebookDirectAgentExtraction/);
        const beforeDiscover = social.split('const found = await discover(')[0];
        assert.match(beforeDiscover, /direct_login' && isFacebookDirectAgentSearchType/);
    });
});
