import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RAW_CAPTURE_RESULT_TYPE_HINTS } from '../src/services/dataExtractor/searchCampaign/rawCapture/constants.js';
import { normalizeIngestRecord } from '../src/services/dataExtractor/searchCampaign/rawCapture/validation.js';
import { FACEBOOK_STOP_REASONS } from '../src/services/dataExtractor/socialSources/facebookCommunity.util.js';
import { campaignStateFromStop, FACEBOOK_MEMBER_CAMPAIGN_STATES } from '../src/services/dataExtractor/socialSources/facebookMemberCollector.util.js';

describe('facebook member persistence gating', () => {
    it('accepts facebook_profile as a RawCapture result type', () => {
        assert.equal(RAW_CAPTURE_RESULT_TYPE_HINTS.includes('facebook_profile'), true);
        const rec = normalizeIngestRecord({
            title: 'Live Member',
            resultUrl: 'https://www.facebook.com/profile.php?id=100012345678901',
            resultTypeHint: 'facebook_profile',
            notes: 'sourceKind=facebook_group_member; parentGroupId=510207536124194; groupUrl=https://www.facebook.com/groups/510207536124194; reviewStatus=not_reviewed',
        }, 0);
        assert.equal(rec.ok, true);
        assert.equal(rec.value.resultTypeHint, 'facebook_profile');
        assert.match(rec.value.notes, /parentGroupId=510207536124194/);
    });

    it('pauses with persistence_failure instead of counting unsaved cards', () => {
        assert.equal(FACEBOOK_STOP_REASONS.PERSISTENCE_FAILURE, 'persistence_failure');
        assert.equal(campaignStateFromStop({
            collectorMode: 'full_automatic',
            stopReason: 'persistence_failure',
        }), FACEBOOK_MEMBER_CAMPAIGN_STATES.PERSISTENCE_FAILURE);
    });
});
