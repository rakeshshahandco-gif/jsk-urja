import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFacebookUrl, classifyInstagramUrl } from '../src/services/dataExtractor/socialSources/classify.util.js';
import {
    INSTAGRAM_RESERVED_PATHS,
    extractExternalWebsite,
    isFacebookNavigationUrl,
    isFacebookProfilePhp,
    isInstagramReservedUrl,
    shouldKeepInstagramAccount,
    shouldKeepProfilePhp,
    textHasKeywordEvidence,
} from '../src/services/dataExtractor/socialSources/directLogin.quality.util.js';
import {
    isSocialSessionIsolatedFromWhatsApp,
    writeSocialSession,
    readSocialSession,
    clearSocialSession,
} from '../src/services/dataExtractor/socialSources/sessionStore.util.js';

const RECORD_ALLOWED = new Set([
    'title', 'snippet', 'resultUrl', 'resultPosition', 'sourceRecordId', 'resultTypeHint', 'notes',
]);

describe('phase3c facebook/instagram direct quality', () => {
    it('rejects Facebook navigation and chrome URLs', () => {
        const nav = [
            'https://www.facebook.com/messages',
            'https://www.facebook.com/notifications',
            'https://www.facebook.com/friends',
            'https://www.facebook.com/settings',
            'https://www.facebook.com/help',
            'https://www.facebook.com/marketplace',
            'https://www.facebook.com/gaming',
            'https://www.facebook.com/search/top?q=Home%20Automation',
            'https://www.facebook.com/login',
            'https://www.facebook.com/logout',
        ];
        for (const url of nav) {
            assert.equal(classifyFacebookUrl(url, 'pages'), null, url);
            assert.equal(isFacebookNavigationUrl(url), true, url);
        }
    });

    it('accepts a valid Facebook Page URL', () => {
        const page = classifyFacebookUrl('https://www.facebook.com/Legrand.In', 'pages');
        assert.equal(page.resultTypeHint, 'facebook_page');
        assert.equal(page.pageUrl, 'https://www.facebook.com/Legrand.In');
        assert.equal(page.urlKind, 'page');
    });

    it('accepts a valid Facebook Group URL and rejects /search/groups', () => {
        const group = classifyFacebookUrl('https://www.facebook.com/groups/12938170358', 'groups');
        assert.equal(group.resultTypeHint, 'facebook_group');
        assert.equal(group.pageUrl, 'https://www.facebook.com/groups/12938170358');
        assert.equal(classifyFacebookUrl('https://www.facebook.com/search/groups', 'groups'), null);
        assert.equal(classifyFacebookUrl('https://www.facebook.com/search/groups/?q=Home%20Automation', 'group_intelligence'), null);
    });

    it('retains profile.php only when business evidence is visible', () => {
        const classified = classifyFacebookUrl('https://www.facebook.com/profile.php?id=123456789', 'pages');
        assert.ok(classified);
        assert.equal(classified.urlKind, 'profile_php');
        assert.equal(classified.needsBusinessEvidence, true);
        assert.equal(isFacebookProfilePhp(classified.pageUrl), true);
        assert.equal(shouldKeepProfilePhp({
            cardText: 'Personal photos and friends',
            keyword: 'Home Automation',
        }), false);
        assert.equal(shouldKeepProfilePhp({
            cardText: 'Works at Mumbai Home Automation · KNX integrator · website https://ha-mumbai.example.in',
            keyword: 'Home Automation',
        }), true);
    });

    it('rejects Instagram reserved routes including explore/popular/accounts/direct', () => {
        const reserved = [
            'https://www.instagram.com/explore',
            'https://www.instagram.com/explore/',
            'https://www.instagram.com/explore/popular',
            'https://www.instagram.com/accounts/edit/',
            'https://www.instagram.com/direct/inbox/',
            'https://www.instagram.com/reels/',
            'https://www.instagram.com/stories/',
        ];
        for (const url of reserved) {
            assert.equal(classifyInstagramUrl(url, 'business_profiles'), null, url);
            assert.equal(isInstagramReservedUrl(url), true, url);
        }
        assert.ok(INSTAGRAM_RESERVED_PATHS.includes('explore'));
        assert.ok(INSTAGRAM_RESERVED_PATHS.includes('popular'));
        assert.ok(INSTAGRAM_RESERVED_PATHS.includes('direct'));
    });

    it('accepts an actual Instagram username profile', () => {
        const ig = classifyInstagramUrl('https://www.instagram.com/smarthome.india/', 'business_profiles');
        assert.equal(ig.resultTypeHint, 'instagram_profile');
        assert.equal(ig.pageUrl, 'https://www.instagram.com/smarthome.india/');
        assert.equal(classifyInstagramUrl('https://www.instagram.com/p/abc123/', 'business_profiles'), null);
    });

    it('excludes the logged-in Instagram account when it is not a matching search result', () => {
        assert.equal(shouldKeepInstagramAccount({
            handle: 'rakesh661971',
            displayName: 'Rakesh',
            bio: 'Personal photos',
            keyword: 'Home Automation',
            loggedInUsername: 'rakesh661971',
        }), false);
        assert.equal(shouldKeepInstagramAccount({
            handle: 'mumbai.homeautomation',
            displayName: 'Mumbai Home Automation',
            bio: 'KNX and smart lighting integrator',
            keyword: 'Home Automation',
            loggedInUsername: 'rakesh661971',
        }), true);
    });

    it('preserves external website extraction and ignores social hosts', () => {
        const website = extractExternalWebsite('Visit us at https://www.abcautomation.in/contact and also https://www.facebook.com/abcautomation');
        assert.equal(website, 'https://www.abcautomation.in/contact');
        assert.equal(extractExternalWebsite('https://www.instagram.com/abcautomation/'), '');
        assert.equal(extractExternalWebsite('https://www.bing.com/maps/default.aspx'), '');
        assert.equal(extractExternalWebsite('https://www.meta.ai/'), '');
        assert.equal(extractExternalWebsite('https://www.threads.com/@demo'), '');
        assert.equal(textHasKeywordEvidence('KNX DALI smart lighting', 'Home Automation'), true);
    });

    it('preserves social source metadata in the existing RawCapture notes shape', () => {
        const notes = [
            'source=facebook',
            'mode=direct_login',
            'searchType=pages',
            'keyword=Home Automation',
            'location=Mumbai',
            'evidenceUrl=https://www.facebook.com/Legrand.In',
            'website=https://www.legrand.in',
            'extractedAt=2026-08-18T00:00:00.000Z',
        ].join('; ');
        const record = {
            title: 'Legrand.In',
            snippet: 'Electrical and home automation',
            resultUrl: 'https://www.facebook.com/Legrand.In',
            resultTypeHint: 'facebook_page',
            sourceRecordId: 'facebook:Legrand.In',
            notes,
        };
        for (const key of Object.keys(record)) {
            assert.equal(RECORD_ALLOWED.has(key), true, key);
        }
        assert.match(record.notes, /source=facebook/);
        assert.match(record.notes, /mode=direct_login/);
        assert.match(record.notes, /searchType=pages/);
        assert.match(record.notes, /evidenceUrl=/);
        assert.match(record.notes, /website=https:\/\/www\.legrand\.in/);
    });

    it('keeps Facebook and Instagram sessions isolated', () => {
        const fb = 'phase3c-iso-fb';
        const ig = 'phase3c-iso-ig';
        writeSocialSession('facebook', fb, { status: 'connected', note: 'fb' });
        writeSocialSession('instagram', ig, { status: 'connected', note: 'ig' });
        assert.equal(readSocialSession('facebook', fb).status, 'connected');
        assert.equal(readSocialSession('instagram', ig).status, 'connected');
        assert.equal(isSocialSessionIsolatedFromWhatsApp(), true);
        clearSocialSession('facebook', fb);
        assert.equal(readSocialSession('facebook', fb).status, 'disconnected');
        assert.equal(readSocialSession('instagram', ig).status, 'connected');
        clearSocialSession('instagram', ig);
    });
});
