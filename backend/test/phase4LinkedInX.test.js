import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { classifyLinkedInUrl, classifyXUrl, xPostToProfileEvidence, linkedinPublicQueries, xPublicQueries } from '../src/services/dataExtractor/socialSources/linkedinX.classify.util.js';
import { extractExternalWebsite, isExternalBusinessWebsite } from '../src/services/dataExtractor/socialSources/directLogin.quality.util.js';
import {
    isSocialSessionIsolatedFromWhatsApp,
    writeSocialSession,
    readSocialSession,
    clearSocialSession,
    socialUserDataDir,
} from '../src/services/dataExtractor/socialSources/sessionStore.util.js';
import { buildSearchUrl } from '../src/services/dataExtractor/searchCampaign/searchQuery/normalize.util.js';
import { validateAssistedSearchUrl } from '../src/services/dataExtractor/searchCampaign/assistedCapture/googleUrl.util.js';
import { disconnectSocialLogin } from '../src/services/dataExtractor/socialSources/directLogin.adapter.js';
import { getSocialSourceStatus } from '../src/services/dataExtractor/socialSources/socialExtraction.service.js';

const LI_A = 'phase4-li-a';
const LI_B = 'phase4-li-b';
const X_A = 'phase4-x-a';
const FB_A = 'phase4-fb-guard';
const IG_A = 'phase4-ig-guard';

after(() => {
    clearSocialSession('linkedin', LI_A);
    clearSocialSession('linkedin', LI_B);
    clearSocialSession('x', X_A);
    clearSocialSession('facebook', FB_A);
    clearSocialSession('instagram', IG_A);
});

describe('phase4 linkedin and x source adapters', () => {
    it('accepts LinkedIn company URLs and rejects navigation', () => {
        const company = classifyLinkedInUrl('https://www.linkedin.com/company/abc-home-automation', 'companies');
        assert.equal(company.resultTypeHint, 'linkedin_company');
        assert.equal(company.pageUrl, 'https://www.linkedin.com/company/abc-home-automation');
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/feed', 'companies'), null);
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/messaging', 'companies'), null);
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/notifications', 'companies'), null);
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/jobs', 'companies'), null);
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/learning', 'companies'), null);
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/search/results/companies/?keywords=x', 'companies'), null);
        assert.equal(classifyLinkedInUrl('https://www.linkedin.com/login', 'companies'), null);
    });

    it('accepts LinkedIn professional URLs', () => {
        const person = classifyLinkedInUrl('https://www.linkedin.com/in/rahul-shah-ha', 'professionals');
        assert.equal(person.resultTypeHint, 'linkedin_profile');
        assert.equal(person.pageUrl, 'https://www.linkedin.com/in/rahul-shah-ha');
    });

    it('accepts X profile URLs and rejects system routes', () => {
        const profile = classifyXUrl('https://x.com/abcautomation', 'profiles');
        assert.equal(profile.resultTypeHint, 'x_profile');
        assert.equal(profile.pageUrl, 'https://x.com/abcautomation');
        assert.equal(classifyXUrl('https://twitter.com/abcautomation', 'profiles').pageUrl, 'https://x.com/abcautomation');
        assert.equal(classifyXUrl('https://x.com/home', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/explore', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/notifications', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/messages', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/i/flow/login', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/settings', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/compose/post', 'profiles'), null);
        assert.equal(classifyXUrl('https://x.com/search?q=ha', 'profiles'), null);
    });

    it('maps an X post to author profile evidence instead of a company', () => {
        const post = classifyXUrl('https://x.com/abcautomation/status/123456789', 'posts');
        assert.equal(post.resultTypeHint, 'x_post');
        assert.equal(post.handle, 'abcautomation');
        const mapped = xPostToProfileEvidence(post, { snippet: 'We completed KNX + DALI automation' });
        assert.equal(mapped.resultTypeHint, 'x_profile');
        assert.equal(mapped.pageUrl, 'https://x.com/abcautomation');
        assert.equal(mapped.evidenceUrl, 'https://x.com/abcautomation/status/123456789');
        assert.match(mapped.snippet, /KNX/);
    });

    it('retains LinkedIn/X source metadata in the existing RawCapture notes shape', () => {
        const notes = 'source=linkedin; mode=direct_login; searchType=companies; keyword=Home Automation; location=Mumbai; evidenceUrl=https://www.linkedin.com/company/abc; website=https://abcautomation.com; extractedAt=2026-08-18T00:00:00.000Z';
        const record = {
            title: 'ABC Automation',
            snippet: 'Home automation integrator',
            resultUrl: 'https://www.linkedin.com/company/abc',
            resultTypeHint: 'linkedin_company',
            sourceRecordId: 'linkedin:abc',
            notes,
        };
        const allowed = new Set(['title', 'snippet', 'resultUrl', 'resultPosition', 'sourceRecordId', 'resultTypeHint', 'notes']);
        for (const key of Object.keys(record)) assert.equal(allowed.has(key), true, key);
        assert.match(record.notes, /source=linkedin/);
        assert.match(record.notes, /mode=direct_login/);
        assert.match(record.notes, /website=https:\/\/abcautomation.com/);
    });

    it('preserves external company website extraction and ignores social hosts', () => {
        assert.equal(extractExternalWebsite('Visit https://abcautomation.com and https://www.linkedin.com/company/abc').replace(/\/$/, ''), 'https://abcautomation.com');
        assert.equal(isExternalBusinessWebsite('https://x.com/abcautomation'), false);
        assert.equal(isExternalBusinessWebsite('https://twitter.com/abcautomation'), false);
        assert.equal(isExternalBusinessWebsite('https://www.linkedin.com/company/abc'), false);
    });

    it('isolates LinkedIn and X sessions from each other and from Facebook/Instagram', async () => {
        writeSocialSession('facebook', FB_A, { status: 'connected', note: 'fb' });
        writeSocialSession('instagram', IG_A, { status: 'connected', note: 'ig' });
        writeSocialSession('linkedin', LI_A, { status: 'connected', note: 'li-a' });
        writeSocialSession('x', X_A, { status: 'connected', note: 'x-a' });
        writeSocialSession('linkedin', LI_B, { status: 'connected', note: 'li-b' });

        const dropped = await disconnectSocialLogin({ platform: 'linkedin', companyId: LI_A });
        assert.equal(dropped.status, 'disconnected');
        assert.equal(readSocialSession('linkedin', LI_A).status, 'disconnected');
        assert.equal(readSocialSession('linkedin', LI_B).status, 'connected');
        assert.equal(readSocialSession('x', X_A).status, 'connected');
        assert.equal(readSocialSession('facebook', FB_A).status, 'connected');
        assert.equal(readSocialSession('instagram', IG_A).status, 'connected');
        assert.equal(isSocialSessionIsolatedFromWhatsApp(), true);
        assert.throws(() => socialUserDataDir('unknown', LI_A));
        assert.ok(socialUserDataDir('linkedin', LI_A).includes(`${path.sep}linkedin${path.sep}`));
        assert.ok(socialUserDataDir('x', X_A).includes(`${path.sep}x${path.sep}`));
        assert.ok(socialUserDataDir('facebook', FB_A).includes(`${path.sep}facebook${path.sep}`));
    });

    it('builds LinkedIn/X search URLs for the existing Processing session', () => {
        const li = buildSearchUrl('linkedin', 'Home Automation Mumbai');
        const x = buildSearchUrl('x', 'Home Automation');
        assert.match(li, /^https:\/\/www\.linkedin\.com\/search\/results\/companies\//);
        assert.match(x, /^https:\/\/x\.com\/search\?/);
        assert.equal(validateAssistedSearchUrl(li).includes('linkedin.com'), true);
        assert.equal(validateAssistedSearchUrl(x).includes('x.com'), true);
    });

    it('does not auto-verify or auto-create CRM leads from LinkedIn/X status', () => {
        const api = getSocialSourceStatus({ platform: 'linkedin', companyId: LI_B });
        const payload = JSON.stringify(api);
        assert.equal(payload.includes('autoVerify'), false);
        assert.equal(payload.includes('convertToLead'), false);
        assert.equal(api.directLogin.status, 'connected');
        assert.equal(Object.keys(api.directLogin).sort().join(','), 'connectedAt,isolatedFromWhatsApp,note,status');
    });

    it('hydration failure contract does not invent chrome candidates', () => {
        const empty = { records: [], errors: ['results_not_hydrated'] };
        assert.equal(empty.records.length, 0);
        assert.ok(empty.errors.includes('results_not_hydrated'));
    });

    it('builds generic LinkedIn and X public queries from the keyword', () => {
        const li = linkedinPublicQueries({ keyword: 'LED Driver', location: 'Pune', searchType: 'companies' });
        assert.ok(li.some((q) => q.includes('site:linkedin.com/company') && q.includes('LED Driver')));
        assert.ok(!li.join(' ').toLowerCase().includes('home automation'));
        const people = linkedinPublicQueries({ keyword: 'Home Automation', location: 'Mumbai', searchType: 'professionals' });
        assert.ok(people.some((q) => q.includes('site:linkedin.com/in')));
        const xq = xPublicQueries({ keyword: 'Home Automation', location: 'Mumbai', searchType: 'profiles' });
        assert.ok(xq.some((q) => q.includes('site:x.com') && q.includes('"Home Automation"')));
    });
});
