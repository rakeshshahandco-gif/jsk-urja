/**
 * Null-safety helpers for Simple Lead Search UI (fresh load / missing queries).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    AUTO_RESUME_BACKLOG_MESSAGE,
    CAMPAIGN_LOAD_ERROR_MESSAGE,
    reconcileBucketsFromCounts,
    safeGeneratedQueries,
    safeQueryIndex,
    safeQueryTotal,
    shouldKeepPollingForAutoProcessing,
} from './simpleLeadSearchUi.js';

describe('Simple Lead Search UI null-safety', () => {
    it('renders empty query list when campaign/result are null', () => {
        assert.deepEqual(safeGeneratedQueries(null, null), []);
        assert.deepEqual(safeGeneratedQueries(undefined, undefined), []);
    });

    it('renders empty query list when queries field is missing', () => {
        assert.deepEqual(safeGeneratedQueries({}, {}), []);
        assert.deepEqual(safeGeneratedQueries({ queryTotal: 3 }, { campaign: { name: 'X' } }), []);
    });

    it('renders empty query list when queries=[]', () => {
        assert.deepEqual(safeGeneratedQueries({ queries: [] }, { queries: [] }), []);
    });

    it('prefers campaignProgress.queries when present', () => {
        const progress = { queries: [{ id: 'a', queryText: 'home automation mumbai' }] };
        const result = { queries: [{ id: 'b', queryText: 'other' }] };
        assert.equal(safeGeneratedQueries(progress, result).length, 1);
        assert.equal(safeGeneratedQueries(progress, result)[0].id, 'a');
    });

    it('falls back to result.queries when progress.queries absent', () => {
        const result = { queries: [{ id: 'r1', queryText: 'q' }] };
        assert.equal(safeGeneratedQueries(null, result)[0].id, 'r1');
        assert.equal(safeGeneratedQueries({ queries: null }, result)[0].id, 'r1');
    });

    it('safeQueryTotal handles null campaign and empty queries', () => {
        assert.equal(safeQueryTotal(null, null, null), 0);
        assert.equal(safeQueryTotal({}, { queries: [] }, null), 0);
        assert.equal(safeQueryTotal({ queryTotal: 12 }, null, null), 12);
        assert.equal(safeQueryTotal(null, { queries: [{}, {}] }, null), 2);
    });

    it('safeQueryIndex defaults to 1 when missing', () => {
        assert.equal(safeQueryIndex(null, null, null), 1);
        assert.equal(safeQueryIndex({ queryIndex: 2 }, null, null), 2);
    });

    it('exposes owner-friendly campaign load message', () => {
        assert.match(CAMPAIGN_LOAD_ERROR_MESSAGE, /Unable to load the previous campaign/);
    });

    it('keeps polling when backlog remains even if capture session inactive', () => {
        assert.equal(shouldKeepPollingForAutoProcessing({
            status: 'idle',
            enabled: false,
            counts: { processingBacklog: 140 },
        }, true), true);
        assert.equal(shouldKeepPollingForAutoProcessing({
            status: 'paused_owner',
            enabled: true,
            counts: { processingBacklog: 140 },
        }, true), false);
        assert.equal(shouldKeepPollingForAutoProcessing({
            status: 'stopped',
            enabled: false,
            counts: { processingBacklog: 140 },
        }, true), false);
    });

    it('reconcile buckets are exclusive additives', () => {
        const b = reconcileBucketsFromCounts({
            reconcileWaiting: 140,
            reconcileProcessing: 0,
            reconcileCompleted: 7,
            reconcileReviewRequired: 0,
            reconcileRejectedSkipped: 0,
            reconcileFailed: 2,
            stageEnrichmentDocs: 8,
            stageQualificationDocs: 8,
            stageGenuinenessDocs: 8,
        });
        assert.equal(b.total, 149);
        assert.equal(b.stageEnrichmentDocs, 8);
        assert.match(AUTO_RESUME_BACKLOG_MESSAGE, /Pending records detected/);
    });
});
