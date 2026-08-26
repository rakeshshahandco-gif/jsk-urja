import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    beginFacebookExtract,
    beginFacebookGroupSearch,
    endFacebookExtract,
    endFacebookGroupSearch,
    getFacebookExtractProgress,
    getFacebookGroupSearchProgress,
    publishFacebookGroupSearchRow,
    pushFacebookActivity,
} from '../src/services/dataExtractor/socialSources/facebookExtractControl.util.js';
import {
    deriveFacebookLiveMemberStatus,
    presentFacebookCommunityRow,
} from '../src/services/dataExtractor/socialSources/facebookCommunity.util.js';
import { FACEBOOK_MEMBER_DISCOVERY_BATCH as DISCOVERY_BATCH } from '../src/services/dataExtractor/socialSources/facebookMemberCollector.util.js';

describe('facebook live visibility helpers', () => {
    it('keeps discovery checkpoint batch at 20', () => {
        assert.equal(DISCOVERY_BATCH, 20);
    });

    it('publishes find-group rows incrementally without duplicates', () => {
        const companyId = 'live-group-search';
        beginFacebookGroupSearch(companyId, { kind: 'find', keyword: 'smart home' });
        publishFacebookGroupSearchRow(companyId, {
            groupUrl: 'https://www.facebook.com/groups/510207536124194',
            groupName: 'Smart Home Automation',
            groupId: '510207536124194',
            members: '10.9K',
        });
        publishFacebookGroupSearchRow(companyId, {
            groupUrl: 'https://www.facebook.com/groups/844819915698667',
            groupName: 'Smart Home Automation India',
            members: '1.7K',
        });
        publishFacebookGroupSearchRow(companyId, {
            groupUrl: 'https://www.facebook.com/groups/510207536124194',
            groupName: 'Smart Home Automation',
            members: '10.9K',
            privacy: 'Public',
        });
        const snap = getFacebookGroupSearchProgress(companyId);
        assert.equal(snap.found, 2);
        assert.equal(snap.groups[0].seq, 1);
        assert.equal(snap.groups[1].groupName, 'Smart Home Automation India');
        assert.equal(snap.groups[0].privacy, 'Public');
        endFacebookGroupSearch(companyId);
        assert.equal(getFacebookGroupSearchProgress(companyId).running, false);
    });

    it('caps activity and updates the same extract job', () => {
        const companyId = 'live-activity';
        beginFacebookExtract(companyId, { groupId: '510207536124194', uniqueAtStart: 10 });
        pushFacebookActivity(companyId, 'Opened People tab');
        pushFacebookActivity(companyId, 'Found Rahul Shah');
        for (let i = 0; i < 50; i += 1) pushFacebookActivity(companyId, `Found member ${i}`);
        const live = getFacebookExtractProgress(companyId);
        assert.ok(live.activity.length <= 40);
        assert.equal(live.groupId, '510207536124194');
        endFacebookExtract(companyId);
        assert.equal(getFacebookExtractProgress(companyId).running, false);
    });

    it('derives live status on the same presented member row', () => {
        assert.equal(deriveFacebookLiveMemberStatus({ reviewStatus: 'not_reviewed' }), 'Discovered');
        assert.equal(deriveFacebookLiveMemberStatus({ reviewStatus: 'reviewed', relevance: 'relevant' }), 'Relevant');
        assert.equal(deriveFacebookLiveMemberStatus({ reviewStatus: 'reviewed', phone: '9876543210' }), 'Contactable');
        const row = presentFacebookCommunityRow({
            title: 'Rahul Shah',
            resultUrlNormalized: 'https://www.facebook.com/rahul.shah',
            notes: 'discoveryType=group_people_tab; memberName=Rahul Shah; reviewStatus=not_reviewed; parentGroup=Smart Home Automation',
        });
        assert.equal(row.name, 'Rahul Shah');
        assert.equal(row.liveStatus, 'Discovered');
    });
});
