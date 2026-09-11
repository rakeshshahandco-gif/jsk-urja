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
    isLongAgentOfflinePause,
    isOwnerManualPause,
    OWNER_PAUSE,
    campaignHasUnfinishedDiscovery,
    isAuthoritativeCollectionComplete,
    AGENT_OFFLINE_WAIT_MESSAGE,
    AGENT_SLEEP_PAUSE_MESSAGE,
    DISCOVERY_AGENT_OFFLINE,
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
    RUN_LOAD,
    RUN_LOAD_MESSAGES,
    nextSessionLoadRetryMs,
    isRetryableSessionLoadError,
    isConfirmedSessionAbsent,
    classifySessionLoadError,
    shouldHideStartExtraction,
    shouldAllowStartExtraction,
    reduceRunSessionLoad,
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

    it('does not treat unfinished sleep/offline campaigns as Completed', () => {
        const unfinished = {
            status: 'completed',
            pendingQueries: 15,
            queryIndex: 1,
            queryTotal: 16,
            queriesCompleted: 0,
            pauseReason: DISCOVERY_AGENT_OFFLINE,
            lastErrorCode: DISCOVERY_AGENT_OFFLINE,
            lastErrorMessage: AGENT_SLEEP_PAUSE_MESSAGE,
            summary: { stopReason: 'all_queries_exhausted' },
        };
        assert.equal(campaignHasUnfinishedDiscovery(unfinished, { queryIndex: 1, queryTotal: 16 }), true);
        assert.equal(isLongAgentOfflinePause(unfinished), true);
        assert.equal(isOwnerManualPause(unfinished), false);
        assert.equal(isOwnerManualPause({ status: 'paused_owner', pauseReason: OWNER_PAUSE }), true);
        assert.equal(isOwnerManualPause({ status: 'paused_owner', pauseReason: 'owner_pause' }), true);
        assert.equal(isWaitingForDiscoveryAgent(unfinished), false);
        assert.equal(isAuthoritativeCollectionComplete(unfinished, { status: 'completed' }, { queryTotal: 16 }), false);
        assert.equal(formatDiscoveryOwnerStatus(unfinished), 'paused_agent_offline');
        assert.equal(lastVisibleRunError({
            autoProcessing: {},
            autoCollection: unfinished,
            session: { status: 'completed' },
            status: 'completed',
        }), '');
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

describe('Simple Lead Search run-page 502 recovery', () => {
    const FIXTURE = Object.freeze({
        sessionId: '6aa3c6e96b4b2f9423daaaf5',
        campaignId: '6aa3be2f6b4b2f9423d9db1b',
        uniqueCount: 160,
        queryIndex: 3,
        googlePage: 3,
    });
    const err502 = { response: { status: 502, data: { message: 'Request failed' } } };
    const err503 = { response: { status: 503 } };
    const err504 = { response: { status: 504 } };
    const errTimeout = { code: 'ECONNABORTED', message: 'timeout of 90000ms exceeded' };
    const errNetwork = { request: {}, message: 'Network Error' };
    const err404 = { response: { status: 404, data: { message: 'Assisted capture session not found' } } };

    it('classifies 502/503/504/timeout/network as retryable, not as no-campaign', () => {
        assert.equal(isRetryableSessionLoadError(err502), true);
        assert.equal(isRetryableSessionLoadError(err503), true);
        assert.equal(isRetryableSessionLoadError(err504), true);
        assert.equal(isRetryableSessionLoadError(errTimeout), true);
        assert.equal(isRetryableSessionLoadError(errNetwork), true);
        assert.equal(isConfirmedSessionAbsent(err502), false);
        assert.equal(isConfirmedSessionAbsent({ response: { status: 502, data: { message: 'failed' } } }), false);
        assert.equal(classifySessionLoadError(err502), 'retryable');
        assert.equal(classifySessionLoadError(err404), 'absent');
        assert.equal(isConfirmedSessionAbsent(err404), true);
        assert.equal(isConfirmedSessionAbsent({ response: { status: 403, data: { message: 'Permission denied' } } }), true);
        assert.equal(isConfirmedSessionAbsent(err502), false);
    });

    it('backs off 2s → 5s → 10s → 15s → 30s max', () => {
        assert.deepEqual(
            [0, 1, 2, 3, 4, 5, 9].map((n) => nextSessionLoadRetryMs(n)),
            [2000, 5000, 10000, 15000, 30000, 30000, 30000],
        );
    });

    it('hides Start Extraction on an existing run while loading or retrying', () => {
        assert.equal(shouldHideStartExtraction({
            isRunRoute: true, runLoadStatus: RUN_LOAD.LOADING, hasResult: false,
        }), true);
        assert.equal(shouldHideStartExtraction({
            isRunRoute: true, runLoadStatus: RUN_LOAD.RETRYING, hasResult: false,
        }), true);
        assert.equal(shouldAllowStartExtraction({
            isRunRoute: true, runLoadStatus: RUN_LOAD.LOADING, hasResult: false,
        }), false);
        assert.equal(shouldAllowStartExtraction({
            isRunRoute: true, runLoadStatus: RUN_LOAD.NOT_FOUND, hasResult: false,
        }), true);
        assert.equal(shouldAllowStartExtraction({
            isRunRoute: false, runLoadStatus: RUN_LOAD.IDLE, hasResult: false,
        }), true);
    });

    it('keeps the fixture campaign across 502 then recovery without Start Extraction', () => {
        let state = reduceRunSessionLoad({}, { type: 'ROUTE', sessionId: FIXTURE.sessionId });
        assert.equal(state.status, RUN_LOAD.LOADING);
        assert.equal(shouldHideStartExtraction({
            isRunRoute: true, runLoadStatus: state.status, hasResult: state.hasResult,
        }), true);

        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err502 });
        assert.equal(state.status, RUN_LOAD.RETRYING);
        assert.equal(state.delayMs, 2000);
        assert.equal(state.hasResult, false);
        assert.equal(shouldHideStartExtraction({
            isRunRoute: true, runLoadStatus: state.status, hasResult: state.hasResult,
        }), true);
        assert.match(RUN_LOAD_MESSAGES.RETRYING, /Retrying this run automatically/i);
        assert.match(RUN_LOAD_MESSAGES.LOADING, /Loading existing campaign/i);

        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err502 });
        assert.equal(state.delayMs, 5000);
        assert.equal(state.warningShown, true);
        assert.equal(state.sessionId, FIXTURE.sessionId);

        state = reduceRunSessionLoad(state, {
            type: 'SUCCESS',
            sessionId: FIXTURE.sessionId,
            campaignId: FIXTURE.campaignId,
            uniqueCount: FIXTURE.uniqueCount,
            queryIndex: FIXTURE.queryIndex,
            googlePage: FIXTURE.googlePage,
        });
        assert.equal(state.status, RUN_LOAD.READY);
        assert.equal(state.sessionId, FIXTURE.sessionId);
        assert.equal(state.campaignId, FIXTURE.campaignId);
        assert.equal(state.uniqueCount, 160);
        assert.equal(state.queryIndex, 3);
        assert.equal(state.googlePage, 3);
        assert.equal(state.showRestoredToast, true);
        assert.equal(shouldHideStartExtraction({
            isRunRoute: true, runLoadStatus: state.status, hasResult: state.hasResult,
        }), false);
        assert.equal(state.hasResult, true);
    });

    it('preserves last known KPIs when a loaded campaign hits a temporary 502', () => {
        let state = reduceRunSessionLoad({}, {
            type: 'SUCCESS',
            sessionId: FIXTURE.sessionId,
            campaignId: FIXTURE.campaignId,
            uniqueCount: 160,
            queryIndex: 3,
            googlePage: 3,
        });
        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err503 });
        assert.equal(state.status, RUN_LOAD.READY);
        assert.equal(state.hasResult, true);
        assert.equal(state.connectionDegraded, true);
        assert.equal(state.uniqueCount, 160);
        assert.equal(state.queryIndex, 3);
        assert.equal(state.googlePage, 3);
        assert.equal(state.sessionId, FIXTURE.sessionId);
        assert.equal(state.campaignId, FIXTURE.campaignId);
        assert.match(RUN_LOAD_MESSAGES.DEGRADED, /Retrying/i);
    });

    it('does not flood warnings on repeated 502s and toasts restored only once', () => {
        let state = reduceRunSessionLoad({}, { type: 'ROUTE', sessionId: FIXTURE.sessionId });
        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err502 });
        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err502 });
        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err504 });
        assert.equal(state.warningShown, true);
        assert.equal(state.attempt, 3);
        state = reduceRunSessionLoad(state, {
            type: 'SUCCESS',
            sessionId: FIXTURE.sessionId,
            campaignId: FIXTURE.campaignId,
            uniqueCount: 160,
            queryIndex: 3,
            googlePage: 3,
        });
        assert.equal(state.showRestoredToast, true);
        assert.equal(RUN_LOAD_MESSAGES.RESTORED, 'Connection restored.');
    });

    it('allows Start Extraction only after a confirmed 404/no session', () => {
        let state = reduceRunSessionLoad({}, { type: 'ROUTE', sessionId: FIXTURE.sessionId });
        state = reduceRunSessionLoad(state, { type: 'ERROR', error: err404 });
        assert.equal(state.status, RUN_LOAD.NOT_FOUND);
        assert.equal(shouldAllowStartExtraction({
            isRunRoute: true, runLoadStatus: state.status, hasResult: state.hasResult,
        }), true);
    });

    it('does not treat a run-page 502 as permission to create a duplicate campaign', () => {
        const state = reduceRunSessionLoad({
            status: RUN_LOAD.LOADING,
            sessionId: FIXTURE.sessionId,
        }, { type: 'ERROR', error: err502 });
        assert.equal(shouldAllowStartExtraction({
            isRunRoute: true, runLoadStatus: state.status, hasResult: false,
        }), false);
        assert.equal(state.sessionId, FIXTURE.sessionId);
    });

    it('wires the run page to retry instead of treating 502 as campaign ended', () => {
        const pageSrc = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), './DataExtractorSimpleLeadSearchPage.jsx'),
            'utf8',
        );
        assert.match(pageSrc, /ignoreBusy: true/);
        assert.match(pageSrc, /isConfirmedSessionAbsent/);
        assert.match(pageSrc, /isRetryableSessionLoadError/);
        assert.match(pageSrc, /RUN_LOAD_MESSAGES\.RETRYING/);
        assert.match(pageSrc, /hideStartExtraction/);
        assert.doesNotMatch(
            pageSrc,
            /status === 404 \|\| \/ended\|inactive\|completed\|expired\|cancelled\|failed\/i/,
        );
    });
});
