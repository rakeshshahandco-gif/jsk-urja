import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    campaignTotalIsUnlimited,
    isFalseCompleteFromProvider,
    reachedFixedCampaignCap,
    simulateUnboundedCollection,
} from '../../src/services/dataExtractor/socialSources/unlimitedExtraction.util.js';

describe('unlimited campaign totals (web / facebook / instagram)', () => {
    it('treats missing or zero maxResults as unlimited', () => {
        assert.equal(campaignTotalIsUnlimited(0), true);
        assert.equal(campaignTotalIsUnlimited(undefined), true);
        assert.equal(campaignTotalIsUnlimited(null), true);
        assert.equal(campaignTotalIsUnlimited(40), false);
        assert.equal(reachedFixedCampaignCap(40, 40), true);
        assert.equal(reachedFixedCampaignCap(25000, 0), false);
        assert.equal(reachedFixedCampaignCap(25000, undefined), false);
    });

    it('continues past 500 / 1,000 / 5,000 with bounded batch memory', () => {
        const run = simulateUnboundedCollection({
            totalAvailable: 5000,
            batchSize: 50,
            uniqueRatio: 0.65,
        });
        assert.equal(run.collected, 5000);
        assert.equal(run.batches, 100);
        assert.equal(run.peakMemory, 50);
        assert.ok(run.peakMemory < 500);
        assert.equal(run.continuedPast500, true);
        assert.equal(run.continuedPast1000, true);
        assert.equal(run.unique, 3250);
        assert.equal(run.uniqueDidNotStopSource, true);
        assert.equal(run.completed, true);
        assert.equal(run.stopReason, 'source_exhausted');
    });

    it('does not mark Complete on a provider rate-limit pause', () => {
        const run = simulateUnboundedCollection({
            totalAvailable: 5000,
            batchSize: 50,
            providerPauseAt: 1200,
        });
        assert.equal(run.collected, 1200);
        assert.equal(run.continuedPast1000, true);
        assert.equal(run.completed, false);
        assert.equal(run.stopReason, 'source_safety_pause');
        assert.equal(isFalseCompleteFromProvider(run.stopReason), true);
        assert.equal(isFalseCompleteFromProvider('source_exhausted'), false);
    });
});
