import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FACEBOOK_COMMUNITY_BATCH_SIZE,
    FACEBOOK_STOP_REASONS,
    addSeenKey,
    classifyFacebookCommunityRelevance,
    displayedCountIsNotExtractedCount,
    facebookCompanyFirst,
    facebookCaptureKey,
    isFacebookPeopleTabMemberHref,
    nextUnseenBatch,
    normalizeFacebookGroupUrl,
    parseDisplayedCount,
    parseFacebookGroupCardMeta,
    extractPublicContactFields,
    FACEBOOK_DISCOVERY_TYPES,
    presentFacebookCommunityRow,
    presentFacebookGroupSearchRow,
    JOINED_GROUP_DISCOVERY_BATCH,
    shouldStopJoinedGroupDiscovery,
    canonicalFacebookGroupFromInput,
    presentExactFacebookGroupLookup,
    resolveExactFacebookGroupName,
    shapeExactFacebookGroupLookupResponse,
    classifyExactFacebookGroupFailure,
    resolveFacebookStopReason,
    shouldIngestFacebookCommunity,
    splitIntoBatches,
    detectFacebookGroupPeopleUi,
    stripFacebookGroupChrome,
} from '../src/services/dataExtractor/socialSources/facebookCommunity.util.js';
import { FACEBOOK_SEARCH_TYPES } from '../src/services/dataExtractor/socialSources/constants.js';
import { extractExternalWebsite, pickRelevantFacebookGroup, rankFacebookGroups } from '../src/services/dataExtractor/socialSources/directLogin.quality.util.js';
import { classifyFacebookUrl } from '../src/services/dataExtractor/socialSources/classify.util.js';

describe('facebook community intelligence', () => {
    it('does not treat displayed group-member count as extracted count', () => {
        assert.equal(parseDisplayedCount('1.7K'), 1700);
        assert.equal(parseDisplayedCount('10.8K'), 10800);
        assert.equal(displayedCountIsNotExtractedCount('10.8K', 12), true);
        assert.equal(displayedCountIsNotExtractedCount('1.7K', 12), true);
        assert.equal(displayedCountIsNotExtractedCount('1.7K', 1700), false);
    });

    it('does not treat displayed follower count as extracted count', () => {
        assert.equal(parseDisplayedCount('3.2K'), 3200);
        assert.equal(displayedCountIsNotExtractedCount('3.2K', 52), true);
        assert.equal(displayedCountIsNotExtractedCount('3.2K', 180), true);
    });

    it('uses 10 as operational batch size, not a total cap', () => {
        const twenty = Array.from({ length: 22 }, (_, i) => ({ resultUrl: `https://www.facebook.com/p${i}` }));
        const batches = splitIntoBatches(twenty, FACEBOOK_COMMUNITY_BATCH_SIZE);
        assert.equal(FACEBOOK_COMMUNITY_BATCH_SIZE, 10);
        assert.equal(batches.length, 3);
        assert.equal(twenty.length, 22);
        assert.ok(twenty.length > 10);
    });

    it('continuation skips seen profiles', () => {
        const seen = new Set();
        const first = nextUnseenBatch(
            ['a', 'b', 'c'].map((h) => ({ resultUrl: `https://www.facebook.com/${h}` })),
            seen,
            10,
        );
        first.batch.forEach((r) => addSeenKey(seen, r));
        const second = nextUnseenBatch(
            ['b', 'c', 'd', 'e'].map((h) => ({ resultUrl: `https://www.facebook.com/${h}` })),
            seen,
            10,
        );
        assert.equal(second.alreadyKnown, 2);
        assert.deepEqual(second.batch.map((r) => facebookCaptureKey(r)), [
            'https://www.facebook.com/d',
            'https://www.facebook.com/e',
        ]);
    });

    it('filters for business relevance', () => {
        assert.equal(classifyFacebookCommunityRelevance({
            name: 'NUOS Home Automation',
            cardText: 'Smart home integrator Mumbai',
            keyword: 'Home Automation',
        }), 'relevant');
        assert.equal(shouldIngestFacebookCommunity('relevant'), true);
    });

    it('does not auto-treat personal unrelated profiles as business candidates', () => {
        const rel = classifyFacebookCommunityRelevance({
            name: 'Rahul Sharma',
            cardText: 'Loves cricket and travel',
            keyword: 'Home Automation',
        });
        assert.equal(rel, 'not_relevant');
        assert.equal(shouldIngestFacebookCommunity(rel), false);
    });

    it('maps company-first from person evidence', () => {
        const mapped = facebookCompanyFirst('Director — ABC Smart Homes, Mumbai', 'Ravi Kumar');
        assert.equal(mapped.companyFirst, true);
        assert.equal(mapped.companyName, 'ABC Smart Homes');
        assert.equal(mapped.personEvidence, 'Ravi Kumar');
    });

    it('extracts website for existing website bridge', () => {
        assert.equal(
            extractExternalWebsite('Visit abcautomation.com for products'),
            'https://abcautomation.com',
        );
    });

    it('cross-source dedup uses stable facebook URL keys', () => {
        const a = facebookCaptureKey({ resultUrl: 'https://www.facebook.com/nuos/' });
        const b = facebookCaptureKey({ resultUrlNormalized: 'https://www.facebook.com/nuos' });
        assert.equal(a, b);
    });

    it('preserves parent group/page provenance fields', () => {
        assert.ok(FACEBOOK_SEARCH_TYPES.includes('group_intelligence'));
        assert.ok(FACEBOOK_SEARCH_TYPES.includes('page_audience'));
        assert.ok(FACEBOOK_SEARCH_TYPES.includes('page_engagement'));
        assert.ok(FACEBOOK_SEARCH_TYPES.includes('related_pages'));
        assert.ok(FACEBOOK_SEARCH_TYPES.includes('pages'));
        assert.ok(FACEBOOK_SEARCH_TYPES.includes('groups'));
    });

    it('does not auto-verify or auto-create leads', () => {
        const row = {
            verification: 'Unverified',
            crmStatus: 'New',
            promotedExtractedLeadId: '',
        };
        assert.notEqual(row.verification, 'Verified');
        assert.notEqual(row.crmStatus, 'Lead');
        assert.equal(row.promotedExtractedLeadId, '');
    });

    it('does not fabricate inaccessible/private profiles', () => {
        assert.equal(classifyFacebookCommunityRelevance({ inaccessible: true, name: 'Hidden' }), 'private_unavailable');
        assert.equal(shouldIngestFacebookCommunity('private_unavailable'), false);
    });

    it('stops safely on exhaustion, session, safety, and technical failure', () => {
        assert.equal(resolveFacebookStopReason({ queueEmpty: true }), FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED);
        assert.equal(resolveFacebookStopReason({ sessionExpired: true }), FACEBOOK_STOP_REASONS.SESSION_EXPIRED);
        assert.equal(resolveFacebookStopReason({ challenge: 'platform_challenge' }), FACEBOOK_STOP_REASONS.SAFETY_PAUSE);
        assert.equal(resolveFacebookStopReason({ technicalError: 'timeout' }), FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE);
        assert.equal(resolveFacebookStopReason({ stopRequested: true }), FACEBOOK_STOP_REASONS.MANUAL_STOP);
    });

    it('classifies public-group People-tab member URLs as profiles, not as the group', () => {
        const member = classifyFacebookUrl('https://www.facebook.com/groups/123456/user/9876543210', 'group_intelligence');
        assert.equal(member.urlKind, 'group_member');
        assert.equal(member.resultTypeHint, 'facebook_profile');
        assert.equal(member.handle, '9876543210');
        const group = classifyFacebookUrl('https://www.facebook.com/groups/123456', 'group_intelligence');
        assert.equal(group.resultTypeHint, 'facebook_group');
        assert.equal(classifyFacebookUrl('https://www.facebook.com/groups/123456', 'pages'), null);
        const people = classifyFacebookUrl('https://www.facebook.com/people/Jane-Doe/100012345678901', 'group_intelligence');
        assert.equal(people.urlKind, 'people_profile');
        assert.equal(people.resultTypeHint, 'facebook_profile');
        assert.equal(people.handle, '100012345678901');
    });

    it('recognizes People-tab member hrefs including /people/ and username cards', () => {
        assert.equal(isFacebookPeopleTabMemberHref('https://www.facebook.com/groups/abc/user/1234567890'), true);
        assert.equal(isFacebookPeopleTabMemberHref('https://www.facebook.com/profile.php?id=1234567890'), true);
        assert.equal(isFacebookPeopleTabMemberHref('https://www.facebook.com/people/Jane-Doe/100012345678901'), true);
        assert.equal(isFacebookPeopleTabMemberHref('https://www.facebook.com/some.integrator'), true);
        assert.equal(isFacebookPeopleTabMemberHref('https://www.facebook.com/groups/abc'), false);
        assert.equal(isFacebookPeopleTabMemberHref('https://www.facebook.com/watch'), false);
    });

    it('normalizes an exact Facebook group URL and parses search-card privacy/members', () => {
        assert.equal(
            normalizeFacebookGroupUrl('https://www.facebook.com/groups/smarthomeautomation/members'),
            'https://www.facebook.com/groups/smarthomeautomation',
        );
        assert.equal(normalizeFacebookGroupUrl('facebook.com/groups/12345'), 'https://www.facebook.com/groups/12345');
        assert.equal(normalizeFacebookGroupUrl('https://www.instagram.com/x'), '');
        const meta = parseFacebookGroupCardMeta('Smart Home Automation\nPublic group · 10.8K members');
        assert.equal(meta.privacy, 'Public');
        assert.equal(meta.members, '10.8K');
        assert.equal(meta.canAnalyzeMembers, true);
        assert.equal(meta.joinedStatus, 'Unknown');
        const joined = parseFacebookGroupCardMeta('Smart Home Automation\nPublic group · 10.9K members\nJoined');
        assert.equal(joined.joinedStatus, 'Joined');
        assert.equal(joined.canAnalyzeMembers, true);
        const privateClosed = parseFacebookGroupCardMeta('Smart Home Professionals\nPrivate group · 18K members', ['Join']);
        assert.equal(privateClosed.privacy, 'Private');
        assert.equal(privateClosed.joinedStatus, 'Not Joined');
        assert.equal(privateClosed.canAnalyzeMembers, false);
        const noisyJoin = parseFacebookGroupCardMeta('Smart Home Automation India\nPublic group · 1.7K members\nJoin our newsletter');
        assert.equal(noisyJoin.joinedStatus, 'Unknown');
    });

    it('extracts public Instagram, WhatsApp, email and website without inventing missing fields', () => {
        const found = extractPublicContactFields({
            text: 'Visit https://nuos.in and IG https://www.instagram.com/nuos.india/ email sales@nuos.in wa.me/919876543210',
            website: 'https://nuos.in',
        });
        assert.equal(found.instagramUrl, 'https://www.instagram.com/nuos.india/');
        assert.equal(found.email, 'sales@nuos.in');
        assert.equal(found.whatsapp, '919876543210');
        assert.equal(found.website, 'https://nuos.in');
        const empty = extractPublicContactFields({ text: 'Rahul Sharma loves cricket' });
        assert.equal(empty.instagramUrl, '');
        assert.equal(empty.email, '');
        assert.equal(empty.phone, '');
        const groupMeta = presentFacebookCommunityRow({
            title: 'Alessio Marzella',
            resultUrlNormalized: 'https://www.facebook.com/groups/510207536124194/user/1676634095',
            notes: 'sourceKind=facebook_group_member; parentGroup=Smart Home Automation; parentGroupId=510207536124194; groupUrl=https://www.facebook.com/groups/510207536124194; facebookUrl=https://www.facebook.com/groups/510207536124194/user/1676634095; reviewStatus=not_reviewed',
        });
        assert.equal(groupMeta.phone, '—');
        assert.equal(groupMeta.whatsapp, '—');
        assert.equal(groupMeta.parentGroupId, '510207536124194');
        assert.equal(groupMeta.parentGroup, 'Smart Home Automation');
        assert.equal(groupMeta.relevantLabel, 'Pending');
        assert.equal(groupMeta.reviewStatus, 'not_reviewed');
        const reviewedNo = presentFacebookCommunityRow({
            title: 'Luis Marques',
            resultUrlNormalized: 'https://www.facebook.com/groups/510207536124194/user/1',
            notes: 'parentGroupId=510207536124194; reviewStatus=reviewed; relevance=not_relevant',
        });
        assert.equal(reviewedNo.relevantLabel, 'No');
        assert.equal(reviewedNo.phone, '—');
        const ignored = extractPublicContactFields({
            text: 'parentGroupId=510207536124194 Call 9876543210',
            ignoreDigits: ['510207536124194'],
        });
        assert.equal(ignored.phone.includes('510207536124194'), false);
        assert.match(ignored.phone.replace(/\D/g, ''), /9876543210/);
        const dirty = presentFacebookCommunityRow({
            title: 'Mary Ou',
            resultUrlNormalized: 'https://www.facebook.com/groups/510207536124194/user/100004499776904',
            notes: 'parentGroupId=510207536124194; reviewStatus=reviewed; relevance=possibly_relevant; phone=+8613751121007 1; whatsapp=86137511210071',
        });
        assert.equal(dirty.phone, '+8613751121007');
        assert.equal(dirty.whatsapp, '8613751121007');
        assert.equal(dirty.phone.includes('510207536124194'), false);
        const related = presentFacebookCommunityRow({
            title: 'Another Home Group',
            resultUrlNormalized: 'https://www.facebook.com/groups/other',
            notes: `discoveryType=${FACEBOOK_DISCOVERY_TYPES.RELATED_GROUP}; parentGroup=Smart Home Automation`,
        });
        assert.equal(related.isRelatedGroup, true);
        assert.equal(related.businessProfessional, 'Related group');
    });

    it('detects a visible People tab on a public group without treating 10.8K as extracted', () => {
        const ui = detectFacebookGroupPeopleUi({
            bodyText: 'Smart Home Automation\nPublic group · 10.8K members\nDiscussion\nPeople\nFind a member',
            hrefs: ['https://www.facebook.com/groups/123/members'],
            pathname: '/groups/123',
        });
        assert.equal(ui.isPublicGroup, true);
        assert.equal(ui.peopleTabVisible, true);
        assert.equal(displayedCountIsNotExtractedCount('10.8K', 0), true);
    });

    it('People-tab batches continue past 10 and 40 with no CRM member ceiling', () => {
        const pool = Array.from({ length: 55 }, (_, i) => ({ resultUrl: `https://www.facebook.com/groups/1/user/${1000 + i}` }));
        const seen = new Set();
        let total = 0;
        let passes = 0;
        while (total < pool.length) {
            const { batch } = nextUnseenBatch(pool, seen, FACEBOOK_COMMUNITY_BATCH_SIZE);
            if (!batch.length) break;
            batch.forEach((r) => addSeenKey(seen, r));
            total += batch.length;
            passes += 1;
        }
        assert.ok(passes >= 6);
        assert.equal(total, 55);
        assert.ok(total > 10);
        assert.ok(total > 40);
    });

    it('does not treat group-name chrome as member business evidence', () => {
        const cleaned = stripFacebookGroupChrome(
            'SMART HOME AUTOMATION Public group · 10.8K members · People · Richie Tong',
            'SMART HOME AUTOMATION',
        );
        assert.equal(/smart home automation/i.test(cleaned), false);
        assert.equal(classifyFacebookCommunityRelevance({
            name: 'Richie Tong',
            cardText: cleaned,
            profileText: cleaned,
            keyword: 'Home Automation',
        }), 'not_relevant');
    });

    it('prefers the exact-named public Smart Home Automation group over India/UK matches', () => {
        const chosen = pickRelevantFacebookGroup([
            { name: 'Smart Home Automation India', cardText: 'Public group · 1.7K members', pageUrl: 'https://www.facebook.com/groups/india' },
            { name: 'Smart Home Automation', cardText: 'Public group · 10.8K members', pageUrl: 'https://www.facebook.com/groups/sha' },
        ], 'Home Automation');
        assert.equal(chosen.pageUrl, 'https://www.facebook.com/groups/sha');
        assert.equal(rankFacebookGroups([
            { name: 'UK Smart Home Automation Group', cardText: '14.1K members', pageUrl: 'https://www.facebook.com/groups/uk' },
            { name: 'Smart Home Automation India', cardText: 'Public group · 1.7K members', pageUrl: 'https://www.facebook.com/groups/india' },
            { name: 'Smart Home Automation', cardText: 'Public group · 10.8K members', pageUrl: 'https://www.facebook.com/groups/sha' },
        ], 'Smart Home Automation')[0].pageUrl, 'https://www.facebook.com/groups/sha');
    });

    it('keeps same-name Facebook groups separate by group ID and does not default to Not Joined', () => {
        const a = presentFacebookGroupSearchRow({
            title: 'Smart Home Automation',
            resultUrl: 'https://www.facebook.com/groups/510207536124194',
            snippet: 'Public group · 10.9K members',
        });
        const b = presentFacebookGroupSearchRow({
            title: 'Smart Home Automation',
            resultUrl: 'https://www.facebook.com/groups/594group',
            snippet: 'Public group · 594 members',
        });
        assert.equal(a.groupId, '510207536124194');
        assert.equal(b.groupId, '594group');
        assert.notEqual(a.groupUrl, b.groupUrl);
        assert.equal(a.joinedStatus, 'Unknown');
        assert.equal(b.joinedStatus, 'Unknown');
        const stamped = presentFacebookGroupSearchRow({
            title: 'Smart Home Automation',
            resultUrl: 'https://www.facebook.com/groups/510207536124194',
            snippet: 'Public group · 10.9K members',
            notes: 'joinedStatus=Joined; groupId=510207536124194',
        });
        assert.equal(stamped.joinedStatus, 'Joined');
        assert.equal(stamped.groupUrl, 'https://www.facebook.com/groups/510207536124194');
        const keywordDoesNotRewrite = presentFacebookGroupSearchRow({
            title: 'Home Automation Mumbai',
            resultUrl: 'https://www.facebook.com/groups/510207536124194',
            snippet: 'keyword=Home Automation',
        });
        assert.equal(keywordDoesNotRewrite.groupUrl, 'https://www.facebook.com/groups/510207536124194');
        assert.equal(keywordDoesNotRewrite.groupId, '510207536124194');
        assert.equal(FACEBOOK_SEARCH_TYPES.includes('pages'), true);
        assert.equal(FACEBOOK_SEARCH_TYPES.includes('joined_groups'), false);
    });

    it('treats 20 as a joined-groups batch size, not a stop cap', () => {
        assert.equal(JOINED_GROUP_DISCOVERY_BATCH, 20);
        assert.equal(shouldStopJoinedGroupDiscovery({
            exactFound: false,
            idlePasses: 0,
            scrollPass: 1,
        }), false);
        assert.equal(shouldStopJoinedGroupDiscovery({ exactFound: true }), true);
        assert.equal(shouldStopJoinedGroupDiscovery({ idlePasses: 5 }), true);
        assert.equal(shouldStopJoinedGroupDiscovery({ sessionAttention: true }), true);
    });

    it('builds a canonical group URL from a numeric Group ID or exact URL', () => {
        assert.deepEqual(canonicalFacebookGroupFromInput('510207536124194'), {
            groupUrl: 'https://www.facebook.com/groups/510207536124194',
            groupId: '510207536124194',
        });
        assert.deepEqual(canonicalFacebookGroupFromInput('https://www.facebook.com/groups/510207536124194/'), {
            groupUrl: 'https://www.facebook.com/groups/510207536124194',
            groupId: '510207536124194',
        });
        assert.deepEqual(canonicalFacebookGroupFromInput('Smart Home Automation'), {
            groupUrl: '',
            groupId: '',
        });
        assert.deepEqual(canonicalFacebookGroupFromInput(''), {
            groupUrl: '',
            groupId: '',
        });
    });

    it('presents exact group lookup from the live landing, without hardcoded name or counts', () => {
        const presented = presentExactFacebookGroupLookup({
            requestedUrl: 'https://www.facebook.com/groups/510207536124194',
            landing: {
                pageUrl: 'https://www.facebook.com/groups/510207536124194',
                h1: 'Live Group Name From Page',
                title: 'Live Group Name From Page | Facebook',
                bodyText: 'Private group · 12.3K members. You are a member. People',
                displayedMemberCount: '12.3K',
                isPublicGroup: false,
                peopleTabLabelVisible: true,
                hrefs: ['https://www.facebook.com/groups/510207536124194/members'],
                controls: ['Joined'],
            },
        });
        assert.equal(presented.ok, true);
        assert.equal(presented.groupId, '510207536124194');
        assert.equal(presented.groupUrl, 'https://www.facebook.com/groups/510207536124194');
        assert.equal(presented.groupName, 'Live Group Name From Page');
        assert.equal(presented.members, '12.3K');
        assert.equal(presented.joinedStatus, 'Joined');
        assert.equal(presented.privacy, 'Private');
        assert.equal(presented.peopleTabAvailable, true);
        assert.equal(presented.peopleTabStatus, 'Available');
        assert.equal(presented.canAnalyzeMembers, true);
        assert.notEqual(presented.groupName, 'Smart Home Automation');
        assert.notEqual(presented.members, '10.9K');
    });

    it('does not treat Facebook chrome such as Chats as the group name', () => {
        assert.equal(resolveExactFacebookGroupName({
            h1: 'Chats',
            title: '(20+) Live Group From Title',
            ogTitle: '',
        }), 'Live Group From Title');
        const presented = presentExactFacebookGroupLookup({
            requestedUrl: 'https://www.facebook.com/groups/510207536124194',
            landing: {
                pageUrl: 'https://www.facebook.com/groups/510207536124194',
                h1: 'Chats',
                title: '(20+) Live Group From Title',
                displayedMemberCount: '11.0K',
                isPublicGroup: true,
                peopleTabLabelVisible: true,
                controls: ['Joined'],
            },
        });
        assert.equal(presented.groupName, 'Live Group From Title');
        assert.equal(presented.members, '11.0K');
    });

    it('shapes exact-group success independently of joined-group lists', () => {
        const group = presentExactFacebookGroupLookup({
            requestedUrl: 'https://www.facebook.com/groups/510207536124194',
            landing: {
                pageUrl: 'https://www.facebook.com/groups/510207536124194',
                title: '(20+) Live Group From Title',
                h1: 'Chats',
                displayedMemberCount: '11.0K',
                isPublicGroup: true,
                peopleTabLabelVisible: true,
                controls: ['Joined'],
            },
        });
        const payload = shapeExactFacebookGroupLookupResponse({
            group,
            built: { groupId: '510207536124194', groupUrl: group.groupUrl },
        });
        assert.equal(payload.found, true);
        assert.equal(payload.startedExtract, false);
        assert.equal(payload.groupId, '510207536124194');
        assert.equal(payload.canonicalUrl, 'https://www.facebook.com/groups/510207536124194');
        assert.equal(payload.membership, 'Joined');
        assert.equal(payload.displayedMembers, '11.0K');
        assert.equal(payload.peopleTabAvailable, true);
        assert.equal(classifyExactFacebookGroupFailure({ error: 'Connect Direct Facebook Login first' }).reason, 'session expired');
        assert.equal(classifyExactFacebookGroupFailure({ attentionRequired: true, error: 'login' }).reason, 'redirected to login');
    });
});
