/**
 * Null-safety helpers for Simple Lead Search UI (fresh load / missing queries).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    formatSimpleSearchLabel,
    formatBusinessTypeField,
    nextSimpleBusinessTypes,
    AUTO_RESUME_BACKLOG_MESSAGE,
    CAMPAIGN_LOAD_ERROR_MESSAGE,
    reconcileBucketsFromCounts,
    safeGeneratedQueries,
    safeQueryIndex,
    lastVisibleRunError,
    safeQueryTotal,
    shouldKeepPollingForAutoProcessing,
    formatQueryProgressLabel,
    pendingQueryCount,
    formatDiscoveryOwnerStatus,
    formatProviderState,
    isWaitingForDiscoveryAgent,
    AGENT_OFFLINE_WAIT_MESSAGE,
    BROWSER_REQUEST_TIMEOUT_MESSAGE,
    isBrowserRequestTimeout,
    isBrowserRequestTimeoutMessage,
    isFatalBrowserTimeoutForCampaign,
    snapshotAfterBrowserRequestTimeout,
    isOwnerStoppedSearch,
    isAlreadyStoppedMessage,
    alreadyStoppedUserMessage,
    allProcessingAlreadyStoppedMessage,
    searchStoppedSuccessMessage,
} from './simpleLeadSearchUi.js';

describe('Simple Lead Search UI null-safety', () => {
    it('formats Product · Business Type · Location', () => {
        assert.equal(formatSimpleSearchLabel('LED Light', 'Manufacturer', 'Mumbai'), 'LED Light · Manufacturer · Mumbai');
        assert.equal(
            formatSimpleSearchLabel('LED Light', ['Manufacturer', 'Exporter'], 'Mumbai'),
            'LED Light · Manufacturer + Exporter · Mumbai',
        );
    });

    it('keeps Any Business exclusive of specific types', () => {
        assert.deepEqual(nextSimpleBusinessTypes(['Manufacturer'], 'Exporter'), ['Manufacturer', 'Exporter']);
        assert.deepEqual(nextSimpleBusinessTypes(['Manufacturer', 'Exporter'], 'Supplier'), ['Manufacturer', 'Exporter', 'Supplier']);
        assert.deepEqual(nextSimpleBusinessTypes(['Manufacturer'], 'Any Business'), ['Any Business']);
        assert.deepEqual(nextSimpleBusinessTypes(['Any Business'], 'Manufacturer'), ['Manufacturer']);
        assert.ok(!nextSimpleBusinessTypes(['Any Business'], 'Manufacturer').includes('Any Business'));
        assert.deepEqual(nextSimpleBusinessTypes(['Manufacturer'], 'Manufacturer'), ['Manufacturer']);
    });

    it('opens older singular requestedBusinessType rows without arrays', () => {
        assert.equal(formatBusinessTypeField({ requestedBusinessType: 'Manufacturer' }), 'Manufacturer');
        assert.equal(
            formatBusinessTypeField({ requestedBusinessTypes: ['Manufacturer', 'Exporter'], requestedBusinessType: 'Manufacturer' }),
            'Manufacturer, Exporter',
        );
        assert.equal(formatBusinessTypeField({}), '-');
    });

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
        assert.equal(shouldKeepPollingForAutoProcessing(null, true), false);
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

    it('shows discovery fail reason when autoProcessing error is blank', () => {
        assert.equal(lastVisibleRunError({
            autoProcessing: { lastErrorMessage: '' },
            autoCollection: { lastErrorMessage: '', status: 'failed', discoveryStatus: 'failed' },
            session: { status: 'failed', failCode: 'UNSUPPORTED_LAYOUT', failMessage: 'No organic results extracted' },
            status: 'failed',
        }), 'No organic results extracted');
        assert.equal(lastVisibleRunError({
            autoProcessing: {},
            autoCollection: { status: 'failed', lastErrorCode: 'UNSUPPORTED_LAYOUT' },
            session: { status: 'failed', failCode: 'UNSUPPORTED_LAYOUT' },
            status: 'failed',
        }), 'No parser results on this page');
        assert.equal(lastVisibleRunError({
            autoProcessing: {},
            autoCollection: { status: 'running' },
            session: { status: 'awaiting_user' },
            status: 'awaiting_user',
        }), '');
    });

    it('formats query progress so in-progress query 1 is not shown as 0/14 only', () => {
        assert.equal(
            formatQueryProgressLabel({ queriesCompleted: 0, queryIndex: 1, queryTotal: 14, googlePage: 12 }),
            '0 completed · Query 1/14 — Page 12',
        );
        assert.equal(pendingQueryCount({ queryIndex: 1, queryTotal: 14 }), 13);
        assert.equal(formatProviderState({ providerState: 'Retry' }), 'Retry');
        assert.equal(
            formatDiscoveryOwnerStatus({ pauseReason: 'unsupported_page_retry', status: 'running', discoveryStatus: 'running' }),
            'Waiting on provider / retrying',
        );
        assert.equal(
            formatDiscoveryOwnerStatus({ providerState: 'Human Verification' }, { status: 'manual_action_required' }),
            'Human verification required',
        );
    });

    it('treats temporary Discovery Agent offline as waiting, not a processing error', () => {
        const waiting = {
            status: 'running',
            pauseReason: 'agent_offline',
            discoveryStatus: 'waiting_for_agent',
            providerState: 'Provider temporarily unavailable',
            lastErrorCode: 'agent_offline',
            lastErrorMessage: AGENT_OFFLINE_WAIT_MESSAGE,
        };
        assert.equal(isWaitingForDiscoveryAgent(waiting), true);
        assert.equal(isWaitingForDiscoveryAgent({ status: 'paused_owner', pauseReason: 'owner_pause' }), false);
        assert.equal(formatDiscoveryOwnerStatus(waiting), 'waiting_for_agent');
        assert.equal(formatProviderState(waiting), 'Provider temporarily unavailable');
        assert.equal(lastVisibleRunError({
            autoProcessing: {},
            autoCollection: waiting,
            session: { status: 'awaiting_user' },
            status: 'awaiting_user',
        }), '');
    });

    it('classifies Axios timeout of 120000ms as a browser HTTP timeout, not Playwright', () => {
        const axiosErr = { code: 'ECONNABORTED', message: 'timeout of 120000ms exceeded' };
        assert.equal(isBrowserRequestTimeout(axiosErr), true);
        assert.equal(isBrowserRequestTimeoutMessage('timeout of 120000ms exceeded'), true);
        assert.equal(isFatalBrowserTimeoutForCampaign(axiosErr), false);
        assert.equal(isBrowserRequestTimeout({ message: 'Google navigation timeout' }), false);
        assert.equal(lastVisibleRunError({
            autoProcessing: {},
            autoCollection: { lastErrorMessage: 'timeout of 120000ms exceeded', status: 'running' },
            session: { status: 'opening' },
            status: 'opening',
        }), '');
    });

    it('keeps a >120-second extraction on the same campaign after the browser request times out', () => {
        const before = {
            campaignId: '6aa29bcb797b59fb54d409a8',
            sessionId: '6aa29bcb797b59fb54d409a8',
            uniqueCount: 20,
            queryIndex: 1,
            googlePage: 3,
        };
        const afterAck = snapshotAfterBrowserRequestTimeout(before);
        assert.equal(afterAck.sameCampaign, true);
        assert.equal(afterAck.campaignId, before.campaignId);
        assert.equal(afterAck.sessionId, before.sessionId);
        assert.equal(afterAck.uniqueCount, 20);
        assert.equal(afterAck.queryIndex, 1);
        assert.equal(afterAck.googlePage, 3);
        assert.equal(afterAck.fatalTimeout, false);
        assert.equal(afterAck.keepPolling, true);
        assert.equal(afterAck.duplicatesCreated, false);
        assert.equal(afterAck.campaignEnded, false);
        assert.match(BROWSER_REQUEST_TIMEOUT_MESSAGE, /still running in the background/i);
        assert.equal(shouldKeepPollingForAutoProcessing({ status: 'running', enabled: true }, true), true);
        const apiSrc = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), '../../services/dataExtractorApi.js'),
            'utf8',
        );
        assert.match(apiSrc, /SLS_COMMAND_ACK_TIMEOUT_MS = 25000/);
        assert.match(apiSrc, /simple-lead-search\/start', payload, \{ timeout: SLS_COMMAND_ACK_TIMEOUT_MS \}/);
        assert.match(apiSrc, /auto-collection\/resume`, \{\}, \{ timeout: SLS_COMMAND_ACK_TIMEOUT_MS \}/);
        assert.doesNotMatch(apiSrc, /simple-lead-search\/start', payload, \{ timeout: 120000 \}/);
    });

    it('treats owner Stop as terminal, not a failed request', () => {
        assert.equal(isOwnerStoppedSearch({ status: 'cancelled' }, { status: 'stopped' }), true);
        assert.equal(isOwnerStoppedSearch({ status: 'awaiting_user' }, { ownerStoppedAt: '2026-09-06' }), true);
        assert.equal(isOwnerStoppedSearch({ status: 'awaiting_user' }, { status: 'running' }), false);
        assert.equal(isAlreadyStoppedMessage('STOPPED BY USER. This search will not resume.'), true);
        assert.equal(alreadyStoppedUserMessage(), 'Search is already stopped.');
        assert.equal(allProcessingAlreadyStoppedMessage(), 'All processing is already stopped.');
        assert.match(searchStoppedSuccessMessage(), /preserved/i);
        assert.equal(lastVisibleRunError({
            autoProcessing: { lastErrorCode: 'owner_stop', lastErrorMessage: 'Stopped by owner. Completed work is preserved.' },
            autoCollection: { lastErrorCode: 'owner_stop', ownerStoppedAt: '2026-09-06', status: 'stopped' },
            session: { status: 'cancelled' },
            status: 'cancelled',
        }), '');
    });
});
