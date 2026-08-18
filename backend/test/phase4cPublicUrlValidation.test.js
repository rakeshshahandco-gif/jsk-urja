import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLinkedInUrl, classifyXUrl, xPostToProfileEvidence } from '../src/services/dataExtractor/socialSources/linkedinX.classify.util.js';
import {
    buildPublicUrlTestCandidate,
    isSyntheticSocialTestUrl,
    PUBLIC_URL_TEST_MODE,
    SYNTHETIC_X_TEST_HANDLE,
} from '../src/services/dataExtractor/socialSources/linkedinX.publicUrl.util.js';
import { getSocialSourceStatus } from '../src/services/dataExtractor/socialSources/socialExtraction.service.js';

describe('phase4c public URL validation', () => {
    it('accepts a LinkedIn company URL with public_url_test metadata', () => {
        const rec = buildPublicUrlTestCandidate({
            platform: 'linkedin',
            publicUrl: 'https://www.linkedin.com/company/nuos-home-automation',
            keyword: 'Home Automation',
            location: 'Mumbai',
            title: 'NUOS Home Automation',
        });
        assert.equal(rec.resultTypeHint, 'linkedin_company');
        assert.equal(rec.resultUrl, 'https://www.linkedin.com/company/nuos-home-automation');
        assert.match(rec.notes, /source=linkedin/);
        assert.match(rec.notes, /mode=public_url_test/);
        assert.equal(rec.notes.includes('mode=direct_login'), false);
        assert.equal(rec.testOnly, false);
        assert.equal(PUBLIC_URL_TEST_MODE, 'public_url_test');
    });

    it('classifies LinkedIn professional URLs without ingesting private contacts', () => {
        const person = classifyLinkedInUrl('https://www.linkedin.com/in/rahul-shah-ha', 'professionals');
        assert.equal(person.resultTypeHint, 'linkedin_profile');
        const rec = buildPublicUrlTestCandidate({
            platform: 'linkedin',
            publicUrl: 'https://www.linkedin.com/in/rahul-shah-ha',
            title: 'Fixture professional',
        });
        assert.equal(rec.resultTypeHint, 'linkedin_profile');
        assert.equal(rec.notes.includes('email='), false);
        assert.equal(rec.notes.includes('phone='), false);
    });

    it('rejects LinkedIn navigation URLs', () => {
        for (const url of [
            'https://www.linkedin.com/feed',
            'https://www.linkedin.com/messaging',
            'https://www.linkedin.com/jobs',
            'https://www.linkedin.com/search/results/companies/?keywords=x',
            'https://www.linkedin.com/notifications',
            'https://www.linkedin.com/login',
        ]) {
            assert.equal(classifyLinkedInUrl(url, 'companies'), null, url);
            assert.throws(() => buildPublicUrlTestCandidate({ platform: 'linkedin', publicUrl: url }));
        }
    });

    it('accepts an X profile and normalizes twitter.com to x', () => {
        const rec = buildPublicUrlTestCandidate({
            platform: 'x',
            publicUrl: `https://twitter.com/${SYNTHETIC_X_TEST_HANDLE}`,
            testOnly: true,
        });
        assert.equal(rec.resultTypeHint, 'x_profile');
        assert.equal(rec.resultUrl, `https://x.com/${SYNTHETIC_X_TEST_HANDLE}`);
        assert.match(rec.notes, /source=x/);
        assert.match(rec.notes, /originalUrl=https:\/\/twitter.com\//);
        assert.equal(rec.testOnly, true);
        assert.match(rec.notes, /testOnly=true/);
        assert.equal(isSyntheticSocialTestUrl(`https://x.com/${SYNTHETIC_X_TEST_HANDLE}`), true);
    });

    it('maps an X post to author profile evidence instead of a company', () => {
        const postUrl = `https://x.com/${SYNTHETIC_X_TEST_HANDLE}/status/1`;
        const classified = classifyXUrl(postUrl, 'posts');
        assert.equal(classified.resultTypeHint, 'x_post');
        const mapped = xPostToProfileEvidence(classified, { snippet: 'fixture post' });
        assert.equal(mapped.resultTypeHint, 'x_profile');
        const rec = buildPublicUrlTestCandidate({ platform: 'x', publicUrl: postUrl, testOnly: true });
        assert.equal(rec.resultTypeHint, 'x_profile');
        assert.equal(rec.resultUrl, `https://x.com/${SYNTHETIC_X_TEST_HANDLE}`);
        assert.match(rec.notes, /postEvidence=/);
        assert.equal(rec.testOnly, true);
    });

    it('rejects X navigation and system routes', () => {
        for (const url of [
            'https://x.com/home',
            'https://x.com/explore',
            'https://x.com/notifications',
            'https://x.com/messages',
            'https://x.com/settings',
            'https://x.com/compose/post',
            'https://x.com/i/flow/login',
            'https://x.com/search?q=ha',
        ]) {
            assert.equal(classifyXUrl(url, 'profiles'), null, url);
            assert.throws(() => buildPublicUrlTestCandidate({ platform: 'x', publicUrl: url }));
        }
    });

    it('preserves RawCapture ingest field shape and does not auto-verify or auto-create leads', () => {
        const rec = buildPublicUrlTestCandidate({
            platform: 'linkedin',
            publicUrl: 'https://www.linkedin.com/company/mb-automation-hub',
            title: 'MB AUTOMATION HUB',
        });
        const allowed = new Set(['title', 'snippet', 'resultUrl', 'resultTypeHint', 'sourceRecordId', 'notes', 'testOnly', 'website']);
        for (const key of Object.keys(rec)) assert.equal(allowed.has(key), true, key);
        const api = getSocialSourceStatus({ platform: 'linkedin', companyId: 'phase4c' });
        const payload = JSON.stringify({ rec, api });
        assert.equal(payload.includes('autoVerify'), false);
        assert.equal(payload.includes('convertToLead'), false);
        assert.equal(api.directLogin.status === 'connected', false);
    });

    it('marks synthetic X fixtures so they cannot be treated as genuine Verified Data by default', () => {
        const rec = buildPublicUrlTestCandidate({
            platform: 'x',
            publicUrl: `https://x.com/${SYNTHETIC_X_TEST_HANDLE}`,
        });
        assert.equal(rec.testOnly, true);
        assert.match(rec.notes, /testOnly=true/);
        assert.match(rec.snippet, /Not a genuine business record/);
    });
});
