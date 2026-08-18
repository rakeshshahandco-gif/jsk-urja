import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyFacebookUrl, classifyInstagramUrl, facebookPublicQueries, instagramPublicQueries } from '../src/services/dataExtractor/socialSources/classify.util.js';
import {
    isSocialSessionIsolatedFromWhatsApp,
    writeSocialSession,
    readSocialSession,
    clearSocialSession,
} from '../src/services/dataExtractor/socialSources/sessionStore.util.js';
import { officialApiStatus } from '../src/services/dataExtractor/socialSources/constants.js';
import { getSocialSourceStatus } from '../src/services/dataExtractor/socialSources/socialExtraction.service.js';
import { disconnectSocialLogin } from '../src/services/dataExtractor/socialSources/directLogin.adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gitignore = fs.readFileSync(path.resolve(__dirname, '../../.gitignore'), 'utf8');
const TEST_FB_A = 'phase3-session-test-a';
const TEST_FB_B = 'phase3-session-test-b';
const TEST_IG_A = 'phase3-session-test-a';

after(() => {
    clearSocialSession('facebook', TEST_FB_A);
    clearSocialSession('facebook', TEST_FB_B);
    clearSocialSession('instagram', TEST_IG_A);
});

describe('phase3 social source adapters', () => {
    it('classifies Facebook pages vs groups by search type', () => {
        const page = classifyFacebookUrl('https://www.facebook.com/SmartHomeMumbai', 'pages');
        assert.equal(page.resultTypeHint, 'facebook_page');
        assert.equal(page.platform, 'facebook');
        const groupBlocked = classifyFacebookUrl('https://www.facebook.com/groups/homeautomationmumbai', 'pages');
        assert.equal(groupBlocked, null);
        const groupOk = classifyFacebookUrl('https://www.facebook.com/groups/homeautomationmumbai', 'group_intelligence');
        assert.equal(groupOk.resultTypeHint, 'facebook_group');
    });

    it('classifies Instagram professional profiles and rejects reels', () => {
        const ig = classifyInstagramUrl('https://www.instagram.com/smarthome.india/', 'business_profiles');
        assert.equal(ig.resultTypeHint, 'instagram_profile');
        assert.equal(classifyInstagramUrl('https://www.instagram.com/p/abc123/', 'business_profiles'), null);
        const tag = classifyInstagramUrl('https://www.instagram.com/explore/tags/homeautomation/', 'hashtag_topic');
        assert.equal(tag.resultTypeHint, 'instagram_hashtag');
    });

    it('builds generic public queries — not Home Automation-only', () => {
        const fb = facebookPublicQueries({ keyword: 'LED Driver', location: 'India', searchType: 'pages' });
        assert.ok(fb.some((q) => q.includes('led driver') || q.toLowerCase().includes('led driver') || q.includes('LED Driver')));
        assert.ok(!fb.join(' ').toLowerCase().includes('home automation'));
        const ig = instagramPublicQueries({ keyword: 'Textile Machinery', searchType: 'business_profiles' });
        assert.ok(ig.some((q) => q.toLowerCase().includes('textile')));
    });

    it('unwraps Bing redirect wrappers to the destination URL', async () => {
        const { unwrapPublicResultLink } = await import('../src/services/dataExtractor/socialSources/publicSearch.adapter.js');
        const wrapped = 'https://www.bing.com/ck/a?!&&p=x&u=a1aHR0cHM6Ly93d3cuaW5zdGFncmFtLmNvbS9zbWFydG5lc3RpbmRpYS8';
        assert.equal(unwrapPublicResultLink(wrapped), 'https://www.instagram.com/smartnestindia/');
    });

    it('keeps Facebook/Instagram sessions isolated from WhatsApp auth', () => {
        assert.equal(isSocialSessionIsolatedFromWhatsApp(), true);
    });

    it('does not claim official group-member API when no token is configured', () => {
        const fb = officialApiStatus('facebook');
        assert.equal(fb.configured, false);
        assert.match(fb.message, /not configured/i);
    });

    it('gitignores social session directories and keeps them off WhatsApp path', () => {
        assert.match(gitignore, /backend\/\.data-extractor-social-sessions\//);
        assert.equal(isSocialSessionIsolatedFromWhatsApp(), true);
    });

    it('isolates Facebook vs Instagram vs company sessions and logout is platform-specific', async () => {
        writeSocialSession('facebook', TEST_FB_A, { status: 'connected', connectedAt: '2026-08-18T00:00:00.000Z', note: 'fb-a' });
        writeSocialSession('instagram', TEST_IG_A, { status: 'connected', connectedAt: '2026-08-18T00:00:00.000Z', note: 'ig-a' });
        writeSocialSession('facebook', TEST_FB_B, { status: 'connected', connectedAt: '2026-08-18T00:00:00.000Z', note: 'fb-b' });

        const dropped = await disconnectSocialLogin({ platform: 'facebook', companyId: TEST_FB_A });
        assert.equal(dropped.status, 'disconnected');
        assert.equal(readSocialSession('facebook', TEST_FB_A).status, 'disconnected');
        assert.equal(readSocialSession('instagram', TEST_IG_A).status, 'connected');
        assert.equal(readSocialSession('facebook', TEST_FB_B).status, 'connected');
        assert.equal(readSocialSession('instagram', TEST_IG_A).note, 'ig-a');
    });

    it('never persists cookies/tokens/passwords and never returns them in status API', () => {
        writeSocialSession('facebook', TEST_FB_A, {
            status: 'connected',
            cookies: [{ name: 'c_user', value: 'secret' }],
            token: 'secret-token',
            password: 'secret-pass',
            note: 'safe-note',
        });
        const rawPath = path.resolve(__dirname, '../.data-extractor-social-sessions/facebook', TEST_FB_A, 'status.json');
        const disk = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
        assert.equal(disk.cookies, undefined);
        assert.equal(disk.token, undefined);
        assert.equal(disk.password, undefined);
        assert.equal(disk.note, 'safe-note');

        writeSocialSession('facebook', TEST_FB_A, { status: 'expired', note: 'Session expired' });
        const api = getSocialSourceStatus({ platform: 'facebook', companyId: TEST_FB_A });
        assert.equal(api.directLogin.status, 'expired');
        const payload = JSON.stringify(api);
        assert.equal(payload.includes('c_user'), false);
        assert.equal(payload.includes('secret-token'), false);
        assert.equal(payload.includes('secret-pass'), false);
        assert.equal(Object.keys(api.directLogin).sort().join(','), 'connectedAt,isolatedFromWhatsApp,note,status');
    });
});
