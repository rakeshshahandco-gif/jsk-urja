import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    mergeSourceMap,
    sanitizeSourceStatusPatch,
} from '../../src/services/dataExtractor/discovery/agent/sourceConnect.util.js';

describe('extraction agent source metadata', () => {
    it('rejects cookies and passwords', () => {
        assert.throws(() => sanitizeSourceStatusPatch({ status: 'connected', cookies: 'x' }), /secrets/);
        assert.throws(() => sanitizeSourceStatusPatch({ password: 'x' }), /secrets/);
    });

    it('keeps facebook and instagram status independent', () => {
        const a = mergeSourceMap({}, 'facebook', { status: 'connected' });
        const b = mergeSourceMap(a, 'instagram', { status: 'expired' });
        assert.equal(b.facebook.status, 'connected');
        assert.equal(b.instagram.status, 'expired');
    });

    it('clears a stale Logged out note on connect', () => {
        const stale = mergeSourceMap({}, 'facebook', { status: 'connected', note: 'Logged out' });
        const next = mergeSourceMap(stale, 'facebook', { status: 'connected' });
        assert.equal(next.facebook.note, '');
    });
});
