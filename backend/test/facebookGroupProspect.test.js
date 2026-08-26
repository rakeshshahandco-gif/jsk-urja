import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyContactableSourceKind,
    facebookParentGroupFromIdentity,
    isFacebookGroupMemberIdentity,
    matchesContactableSource,
    matchesParentGroup,
} from '../src/services/dataExtractor/socialSources/facebookGroupProspect.util.js';
import { presentContactableProspect } from '../src/services/dataExtractor/discovery/phase5/contactability.util.js';

describe('facebook group member visibility on contactable prospects', () => {
    it('classifies people-tab members separately from public discovery listicles', () => {
        const member = {
            canonicalName: 'ABC Home Automation',
            platforms: ['facebook'],
            sourceRefs: [{
                source: 'facebook',
                title: 'Rahul Shah',
                snippet: 'discoveryType=group_people_tab; sourceSurface=facebook_people_tab; parentGroup=Smart Home Automation; groupUrl=https://www.facebook.com/groups/510207536124194; groupId=510207536124194; memberName=Rahul Shah; reviewStatus=reviewed',
                sourceUrl: 'https://www.facebook.com/rahul.shah',
            }],
            social: { facebookUrl: 'https://www.facebook.com/rahul.shah' },
            primaryPhone: '9876543210',
        };
        const listicle = {
            canonicalName: 'List Of Home automation companies in Maharashtra',
            platforms: ['web'],
            sourceRefs: [{
                kind: 'discovery_preview',
                source: 'web_search',
                title: 'List Of Home automation companies in Maharashtra',
                sourceUrl: 'https://example.com/list',
            }],
            city: 'Mumbai',
        };
        assert.equal(isFacebookGroupMemberIdentity(member), true);
        assert.equal(classifyContactableSourceKind(member), 'facebook_group_member');
        assert.equal(classifyContactableSourceKind(listicle), 'public_discovery');
        assert.equal(facebookParentGroupFromIdentity(member).parentGroupId, '510207536124194');
        assert.equal(facebookParentGroupFromIdentity(member).parentGroup, 'Smart Home Automation');
        const presented = presentContactableProspect(member);
        assert.equal(presented.sourceKind, 'facebook_group_member');
        assert.equal(presented.contactPersonName, 'Rahul Shah');
        assert.equal(presented.parentGroupId, '510207536124194');
        assert.equal(matchesContactableSource(presented, 'facebook_group_member'), true);
        assert.equal(matchesParentGroup(presented, '510207536124194'), true);
        assert.equal(matchesParentGroup(presented, '999'), false);
        assert.equal(matchesContactableSource(presentContactableProspect(listicle), 'facebook_group_member'), false);
    });
});
