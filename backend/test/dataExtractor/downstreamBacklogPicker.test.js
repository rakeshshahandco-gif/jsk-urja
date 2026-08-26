/**
 * Downstream backlog picker: exclude already-processed first, then batch limit.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickIdsAwaitingDownstream } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/downstreamBacklogPicker.util.js';

function ids(n, prefix = 'q') {
    return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

describe('pickIdsAwaitingDownstream (CP7/CP8 backlog picker)', () => {
    it('CP8: 60 quals, oldest 50 already have genuineness, last 10 do not → returns the last 10 not 0', () => {
        const candidates = ids(60);
        const alreadyHaveCp8 = candidates.slice(0, 50);
        const picked = pickIdsAwaitingDownstream(candidates, alreadyHaveCp8, 10);
        assert.deepEqual(picked, ids(60).slice(50));
        assert.equal(picked.length, 10);
        assert.equal(picked[0], 'q51');
        assert.equal(picked[9], 'q60');
    });

    it('respects batchSize smaller than remaining backlog', () => {
        const candidates = ids(60);
        const alreadyHaveCp8 = candidates.slice(0, 50);
        const picked = pickIdsAwaitingDownstream(candidates, alreadyHaveCp8, 4);
        assert.deepEqual(picked, ['q51', 'q52', 'q53', 'q54']);
    });

    it('CP7 identical pattern: oldest enrichments already qualified, later ones still picked', () => {
        const enrichments = ids(60, 'e');
        const alreadyHaveCp7 = enrichments.slice(0, 50);
        const picked = pickIdsAwaitingDownstream(enrichments, alreadyHaveCp7, 10);
        assert.deepEqual(picked, ids(60, 'e').slice(50));
    });

    it('returns empty when every candidate already has a downstream doc', () => {
        const candidates = ids(12);
        assert.deepEqual(pickIdsAwaitingDownstream(candidates, candidates, 10), []);
    });

    it('old buggy limit-before-exclude (first 50 only) would miss later waiting ids', () => {
        const candidates = ids(60);
        const alreadyHaveCp8 = candidates.slice(0, 50);
        const oldScanCap = 50;
        const scanned = candidates.slice(0, oldScanCap);
        const oldResult = scanned.filter((id) => !alreadyHaveCp8.includes(id)).slice(0, 10);
        assert.equal(oldResult.length, 0);
        const fixed = pickIdsAwaitingDownstream(candidates, alreadyHaveCp8, 10);
        assert.equal(fixed.length, 10);
    });
});
