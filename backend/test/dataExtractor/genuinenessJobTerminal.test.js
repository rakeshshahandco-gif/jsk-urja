/**
 * CP8 job must become terminal when processedCount >= totalCount
 * so automatic processing can start the next batch.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    canAutoPipelineAdvancePastVerifyJob,
    isGenuinenessJobTerminalStatus,
    isJobProcessedComplete,
    resolveGenuinenessJobTerminalStatus,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/jobTerminal.util.js';

describe('CP8 genuineness job terminal state', () => {
    it('processedCount >= totalCount → completed and pipeline may advance', () => {
        const job = { status: 'processing', processed: 10, total: 10, failedCount: 0 };
        assert.equal(isJobProcessedComplete(job), true);
        assert.equal(resolveGenuinenessJobTerminalStatus(job), 'completed');
        assert.equal(canAutoPipelineAdvancePastVerifyJob(job), true);
        assert.equal(isGenuinenessJobTerminalStatus(job.status), false);
        assert.equal(isGenuinenessJobTerminalStatus('completed'), true);
    });

    it('last item finishing with processed === total closes a processing job', () => {
        const beforeLast = { status: 'processing', processed: 9, total: 10 };
        assert.equal(isJobProcessedComplete(beforeLast), false);
        assert.equal(canAutoPipelineAdvancePastVerifyJob(beforeLast), false);

        const afterLast = { status: 'processing', processed: 10, total: 10 };
        assert.equal(isJobProcessedComplete(afterLast), true);
        assert.equal(resolveGenuinenessJobTerminalStatus(afterLast), 'completed');
        assert.equal(canAutoPipelineAdvancePastVerifyJob(afterLast), true);
    });

    it('stopRequested → stopped even if incomplete', () => {
        const job = { status: 'processing', processed: 3, total: 10, stopRequested: true };
        assert.equal(resolveGenuinenessJobTerminalStatus(job), 'stopped');
    });

    it('all items failed → failed', () => {
        const job = { status: 'processing', processed: 10, total: 10, failedCount: 10 };
        assert.equal(isJobProcessedComplete(job), true);
        assert.equal(resolveGenuinenessJobTerminalStatus(job), 'failed');
        assert.equal(canAutoPipelineAdvancePastVerifyJob(job), true);
    });

    it('some failed → partial', () => {
        const job = { status: 'processing', processed: 10, total: 10, failedCount: 2 };
        assert.equal(resolveGenuinenessJobTerminalStatus(job), 'partial');
        assert.equal(canAutoPipelineAdvancePastVerifyJob(job), true);
    });
});
