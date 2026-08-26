import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FACEBOOK_MEMBER_DISCOVERY_BATCH,
    FACEBOOK_MEMBER_REVIEW_BATCH,
    FACEBOOK_MEMBER_EXPORT_HEADERS,
    FACEBOOK_MEMBER_COLLECTOR_MODES,
    FACEBOOK_MEMBER_CAMPAIGN_STATES,
    campaignNameForFacebookGroup,
    campaignStateFromStop,
    emptyFacebookMemberCheckpoint,
    isOperationalBatchNotCampaignCap,
    mergeFacebookMemberCheckpoint,
    notesHaveGroupUrl,
    shouldContinueFullDiscovery,
    shouldInlineReviewAfterDiscovery,
    exportFacebookMemberRow,
} from '../src/services/dataExtractor/socialSources/facebookMemberCollector.util.js';
import {
    FACEBOOK_AUTO_STAGES,
    duplicateAutoRunMessage,
    facebookAutoRetryDelayMs,
    isSameFacebookAutoLock,
    nextAutoStage,
    shouldAdvanceToReview,
    shouldContinueAutomaticDiscovery,
    shouldContinueAutomaticReview,
    shouldRetryTechnicalFailure,
    isReviewAllCollectorMode,
} from '../src/services/dataExtractor/socialSources/facebookAutoRunner.util.js';
import {
    FACEBOOK_STOP_REASONS,
    addSeenKey,
    classifyFacebookCommunityRelevance,
    facebookCompanyFirst,
    facebookCaptureKey,
    nextUnseenBatch,
    normalizeFacebookGroupUrl,
    resolveFacebookStopReason,
    shouldIngestFacebookCommunity,
    splitIntoBatches,
} from '../src/services/dataExtractor/socialSources/facebookCommunity.util.js';
import { extractExternalWebsite } from '../src/services/dataExtractor/socialSources/directLogin.quality.util.js';

const GROUP = 'https://www.facebook.com/groups/510207536124194';

describe('facebook group member collector', () => {
    it('respects the exact group URL and does not rewrite it from the keyword', () => {
        assert.equal(normalizeFacebookGroupUrl(GROUP), GROUP);
        assert.equal(normalizeFacebookGroupUrl(`${GROUP}/members`), GROUP);
        const name = campaignNameForFacebookGroup({
            groupName: 'Smart Home Automation',
            groupUrl: GROUP,
            keyword: 'Home Automation Mumbai',
        });
        assert.match(name, /510207536124194/);
        assert.match(name, /Smart Home Automation/);
        assert.equal(normalizeFacebookGroupUrl(GROUP) === normalizeFacebookGroupUrl('https://www.facebook.com/groups/someOtherGroup'), false);
    });

    it('deduplicates People-tab profile URLs and does not treat batch size as a lifetime cap', () => {
        const seen = new Set();
        const pool = Array.from({ length: 55 }, (_, i) => ({ resultUrl: `https://www.facebook.com/p${i}` }));
        const first = nextUnseenBatch(pool, seen, FACEBOOK_MEMBER_DISCOVERY_BATCH);
        first.batch.forEach((r) => addSeenKey(seen, r));
        const second = nextUnseenBatch(pool, seen, FACEBOOK_MEMBER_DISCOVERY_BATCH);
        assert.equal(first.batch.length, 20);
        assert.equal(second.alreadyKnown, 20);
        assert.equal(second.batch.length, 20);
        const batches = splitIntoBatches(pool, FACEBOOK_MEMBER_DISCOVERY_BATCH);
        assert.ok(pool.length > 40);
        assert.ok(batches.length >= 3);
        assert.equal(FACEBOOK_MEMBER_REVIEW_BATCH <= FACEBOOK_MEMBER_DISCOVERY_BATCH, true);
    });

    it('does not inline-review after Run Next Batch unless auto-review is explicitly on', () => {
        assert.equal(shouldInlineReviewAfterDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
            autoReviewAfterDiscovery: false,
        }), false);
        assert.equal(shouldInlineReviewAfterDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
            autoReviewAfterDiscovery: true,
        }), true);
        assert.equal(shouldInlineReviewAfterDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_NEXT,
            autoReviewAfterDiscovery: true,
        }), false);
        assert.equal(shouldInlineReviewAfterDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC,
            autoReviewAfterDiscovery: true,
        }), false);
    });

    it('checkpoint merge persists progress and Resume skips already-seen profiles', () => {
        const ckpt = mergeFacebookMemberCheckpoint(
            emptyFacebookMemberCheckpoint({ groupUrl: GROUP, groupName: 'Smart Home Automation' }),
            {
                uniqueMembersCollected: 1500,
                profilesReviewed: 80,
                stopReason: FACEBOOK_STOP_REASONS.MANUAL_STOP,
                status: 'paused',
            },
        );
        assert.equal(ckpt.groupUrl, GROUP);
        assert.equal(ckpt.uniqueMembersCollected, 1500);
        assert.equal(ckpt.stopReason, FACEBOOK_STOP_REASONS.MANUAL_STOP);
        const resumed = nextUnseenBatch(
            ['a', 'b', 'c'].map((h) => ({ resultUrl: `https://www.facebook.com/${h}` })),
            new Set(['https://www.facebook.com/a']),
            20,
        );
        assert.equal(resumed.alreadyKnown, 1);
        assert.equal(resumed.batch.length, 2);
    });

    it('ends source_exhausted when no new profiles appear; stop/session/technical do not clear captured counts', () => {
        assert.equal(resolveFacebookStopReason({ queueEmpty: true }), FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED);
        const kept = mergeFacebookMemberCheckpoint(
            { uniqueMembersCollected: 40, groupUrl: GROUP },
            { stopReason: FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE, status: 'technical_failure' },
        );
        assert.equal(kept.uniqueMembersCollected, 40);
        const session = mergeFacebookMemberCheckpoint(kept, { stopReason: FACEBOOK_STOP_REASONS.SESSION_EXPIRED });
        assert.equal(session.uniqueMembersCollected, 40);
        assert.equal(FACEBOOK_STOP_REASONS.BATCH_COMPLETE, 'batch_complete');
    });

    it('does not treat unrelated personal members as Contactable Prospects and keeps contact person on company-first mapping', () => {
        const rel = classifyFacebookCommunityRelevance({
            name: 'Rahul Sharma',
            cardText: 'Loves cricket and travel',
            keyword: 'Home Automation',
        });
        assert.equal(shouldIngestFacebookCommunity(rel), false);
        const mapped = facebookCompanyFirst('Director at ABC Home Automation', 'Rahul Sharma');
        assert.equal(mapped.companyFirst, true);
        assert.equal(mapped.companyName, 'ABC Home Automation');
        assert.equal(mapped.personEvidence, 'Rahul Sharma');
    });

    it('website enrichment reuses Phase 1 extractor; no auto verify/lead; notes bind members to parent group not a new collection', () => {
        assert.equal(extractExternalWebsite('Site aispeaker.com'), 'https://aispeaker.com');
        assert.equal(notesHaveGroupUrl(`groupUrl=${GROUP}`, GROUP), true);
        assert.equal(notesHaveGroupUrl('groupUrl=https://www.facebook.com/groups/other', GROUP), false);
        const row = { verification: 'Unverified', crmStatus: 'New', promotedExtractedLeadId: '' };
        assert.notEqual(row.verification, 'Verified');
        assert.notEqual(row.crmStatus, 'Lead');
        assert.equal(facebookCaptureKey({ resultUrl: 'https://www.facebook.com/xfocus/' }).includes('facebook.com'), true);
        const exported = exportFacebookMemberRow({
            facebookCommunity: {
                parentGroup: 'Smart Home Automation',
                name: 'Rahul Sharma',
                company: 'ABC Home Automation',
                role: 'Director',
                facebookUrl: 'https://www.facebook.com/rahul',
                website: 'https://example.com',
                phone: '',
            },
            workflow: { crm: 'New' },
        });
        assert.equal(exported[0], 'Smart Home Automation');
        assert.equal(exported[1], 'Rahul Sharma');
        assert.equal(exported[2], 'ABC Home Automation');
        assert.equal(FACEBOOK_MEMBER_EXPORT_HEADERS.includes('Parent Group'), true);
        assert.equal(exported.includes('secret'), false);
    });

    it('full accessible group mode does not treat 20/40/100 as a campaign cap', () => {
        const seen = new Set();
        const pool = Array.from({ length: 120 }, (_, i) => ({ resultUrl: `https://www.facebook.com/m${i}` }));
        let total = 0;
        let batchNo = 0;
        while (total < 100) {
            const { batch } = nextUnseenBatch(pool, seen, FACEBOOK_MEMBER_DISCOVERY_BATCH);
            assert.ok(batch.length > 0);
            batch.forEach((r) => addSeenKey(seen, r));
            total += batch.length;
            batchNo += 1;
        }
        assert.ok(total >= 100);
        assert.ok(batchNo >= 5);
        assert.equal(shouldContinueFullDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY,
            stopReason: 'batch_complete',
        }), true);
        assert.equal(shouldContinueFullDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY,
            stopReason: 'source_exhausted',
        }), false);
        assert.equal(shouldContinueFullDiscovery({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
            stopReason: 'batch_complete',
        }), false);
        assert.equal(isOperationalBatchNotCampaignCap(20, 100), true);
        assert.equal(campaignStateFromStop({
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY,
            stopReason: 'source_exhausted',
        }), FACEBOOK_MEMBER_CAMPAIGN_STATES.SOURCE_EXHAUSTED);
    });

    it('pause/resume keeps checkpoint and skips already-seen URLs (no restart at member 1)', () => {
        const paused = mergeFacebookMemberCheckpoint(
            emptyFacebookMemberCheckpoint({ groupUrl: GROUP }),
            { uniqueMembersCollected: 60, currentBatch: 3, stopReason: FACEBOOK_STOP_REASONS.MANUAL_STOP, campaignState: 'DISCOVERY_PAUSED' },
        );
        assert.equal(paused.uniqueMembersCollected, 60);
        const seen = new Set(Array.from({ length: 60 }, (_, i) => `https://www.facebook.com/m${i}`));
        const pool = Array.from({ length: 80 }, (_, i) => ({ resultUrl: `https://www.facebook.com/m${i}` }));
        const next = nextUnseenBatch(pool, seen, FACEBOOK_MEMBER_DISCOVERY_BATCH);
        assert.equal(next.alreadyKnown, 60);
        assert.equal(next.batch[0].resultUrl, 'https://www.facebook.com/m60');
    });

    it('profile review batch of 8 is not a lifetime cap', () => {
        const pending = Array.from({ length: 24 }, (_, i) => ({ resultUrl: `https://www.facebook.com/p${i}` }));
        const seen = new Set();
        const first = nextUnseenBatch(pending, seen, FACEBOOK_MEMBER_REVIEW_BATCH);
        first.batch.forEach((r) => addSeenKey(seen, r));
        const second = nextUnseenBatch(pending, seen, FACEBOOK_MEMBER_REVIEW_BATCH);
        second.batch.forEach((r) => addSeenKey(seen, r));
        const third = nextUnseenBatch(pending, seen, FACEBOOK_MEMBER_REVIEW_BATCH);
        assert.equal(first.batch.length, 8);
        assert.equal(second.batch.length, 8);
        assert.equal(third.batch.length, 8);
        const reviewed = [...first.batch, ...second.batch, ...third.batch].map((r) => r.resultUrl);
        assert.equal(new Set(reviewed).size, 24);
    });

    it('maps Facebook checkpoint warnings to session_attention_required', () => {
        assert.equal(
            resolveFacebookStopReason({ challenge: 'checkpoint: confirm you are human' }),
            FACEBOOK_STOP_REASONS.SESSION_ATTENTION_REQUIRED,
        );
    });
});

describe('facebook one-click automatic runner', () => {
    it('continues discovery 20→40→60→80→100→120+ without treating batch_complete as campaign end', () => {
        const seen = new Set();
        const pool = Array.from({ length: 140 }, (_, i) => ({ resultUrl: `https://www.facebook.com/auto${i}` }));
        let total = 0;
        let clicks = 0;
        while (total < 120) {
            const { batch } = nextUnseenBatch(pool, seen, FACEBOOK_MEMBER_DISCOVERY_BATCH);
            assert.equal(shouldContinueAutomaticDiscovery({ stopReason: 'batch_complete' }), true);
            batch.forEach((r) => addSeenKey(seen, r));
            total += batch.length;
        }
        assert.ok(total >= 120);
        assert.equal(clicks, 0);
        assert.equal(shouldAdvanceToReview({ stopReason: 'source_exhausted', autoReview: true }), true);
        assert.equal(shouldAdvanceToReview({ stopReason: 'batch_complete', autoReview: true }), false);
    });

    it('continues profile review 8→16→24→32→40 automatically', () => {
        const pending = Array.from({ length: 40 }, (_, i) => ({ resultUrl: `https://www.facebook.com/rev${i}` }));
        const seen = new Set();
        let loops = 0;
        const checkpoints = [];
        while (shouldContinueAutomaticReview({ pendingCount: pending.length - seen.size, loops })) {
            const { batch } = nextUnseenBatch(pending, seen, FACEBOOK_MEMBER_REVIEW_BATCH);
            batch.forEach((r) => addSeenKey(seen, r));
            loops += 1;
            checkpoints.push(seen.size);
        }
        assert.deepEqual(checkpoints, [8, 16, 24, 32, 40]);
        assert.equal(seen.size, 40);
        assert.equal(isReviewAllCollectorMode('review_all'), true);
        assert.equal(isReviewAllCollectorMode('review_next'), false);
        assert.equal(FACEBOOK_MEMBER_REVIEW_BATCH, 8);
    });

    it('duplicate start on the same group does not create a second worker', () => {
        assert.equal(isSameFacebookAutoLock({
            runningGroupId: '510207536124194',
            groupId: '510207536124194',
        }), true);
        assert.equal(isSameFacebookAutoLock({
            runningGroupId: '510207536124194',
            groupId: '999',
        }), false);
        assert.match(duplicateAutoRunMessage({ sameGroup: true }), /already running/i);
    });

    it('pause keeps progress and does not restart at member 1', () => {
        const paused = mergeFacebookMemberCheckpoint(
            emptyFacebookMemberCheckpoint({ groupUrl: GROUP }),
            { uniqueMembersCollected: 80, currentBatch: 4, stopReason: FACEBOOK_STOP_REASONS.MANUAL_STOP },
        );
        assert.equal(paused.uniqueMembersCollected, 80);
        assert.equal(nextAutoStage({ paused: true, currentStage: 'DISCOVERING' }), FACEBOOK_AUTO_STAGES.PAUSED);
        assert.equal(nextAutoStage({ stopReason: 'session_attention_required' }), FACEBOOK_AUTO_STAGES.ATTENTION);
        assert.equal(facebookAutoRetryDelayMs(1), 2000);
        assert.equal(facebookAutoRetryDelayMs(3), 8000);
        assert.equal(shouldRetryTechnicalFailure({ attempt: 1, stopReason: 'technical_failure' }), true);
        assert.equal(shouldRetryTechnicalFailure({ attempt: 3, stopReason: 'technical_failure' }), false);
    });
});
