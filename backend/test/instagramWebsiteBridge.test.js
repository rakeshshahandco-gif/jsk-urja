import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    canonicalExternalWebsite,
    companyCityFromEvidence,
    extractWebsiteFromInstagramEvidence,
    mergeWebsiteIntoStoredNotes,
    normalizeInstagramExternalWebsite,
    stampInstagramWebsiteOnCandidate,
} from '../src/services/dataExtractor/socialSources/instagramWebsiteBridge.util.js';
import { presentSocialCapture } from '../src/services/dataExtractor/socialSources/socialCaptureDisplay.util.js';
import { rawCaptureToEvidence } from '../src/services/dataExtractor/discovery/phase5/identityEvidence.util.js';

const PANIPAT_SNIPPET = 'home_automation_panipat Home Automation Panipat 493 posts 13.9K followers 8 following Automation Service 📞8059694896 Snoli Road, Panipat 132103 wa.me/918059694896 Follow Message';
const TUYA_SNIPPET = 'tuyasmarthome Home Automation 90 posts 2,285 followers China manufacturer www.gobrother.cn Follow';
const SENSOR_SNIPPET = 'sensor_homeautomation Sensor Home Automation 35 posts 277 followers Product/service Nerkundram Bridge, Chennai, India 600107 sensorhomeautomation.in Follow Message';

describe('instagram website enrichment bridge', () => {
    it('extracts a valid external website from Instagram evidence', () => {
        assert.equal(
            extractWebsiteFromInstagramEvidence({ snippet: TUYA_SNIPPET }),
            'https://www.gobrother.cn',
        );
        assert.equal(
            extractWebsiteFromInstagramEvidence({ snippet: SENSOR_SNIPPET }),
            'https://sensorhomeautomation.in',
        );
    });

    it('rejects Instagram/internal/navigation URLs', () => {
        const rejected = [
            'https://www.instagram.com/tuyasmarthome/',
            'https://instagram.com/accounts/login',
            'https://www.threads.net/@foo',
            'https://l.instagram.com/?u=https://instagram.com/x',
            'https://bit.ly/abc',
            'http://localhost/site',
            'http://127.0.0.1/',
            'https://192.168.1.5/admin',
        ];
        for (const url of rejected) {
            assert.equal(normalizeInstagramExternalWebsite(url), '', url);
            assert.equal(extractWebsiteFromInstagramEvidence({ snippet: url, website: url }), '', url);
        }
    });

    it('preserves the original RawCapture snippet when stamping website', () => {
        const rec = {
            snippet: TUYA_SNIPPET,
            notes: 'source=instagram; keyword=Home Automation; location=mumbai',
        };
        stampInstagramWebsiteOnCandidate(rec);
        assert.equal(rec.snippet, TUYA_SNIPPET);
        assert.match(rec.notes, /website=https:\/\/www\.gobrother\.cn/);
        assert.match(rec.notes, /websiteSource=instagram/);
    });

    it('does not turn search location into company city', () => {
        const presented = presentSocialCapture({
            title: 'home_automation_panipat',
            sourceRecordId: 'instagram:home_automation_panipat',
            resultUrlNormalized: 'https://www.instagram.com/home_automation_panipat/',
            snippet: PANIPAT_SNIPPET,
            notes: 'source=instagram; keyword=Home Automation; location=mumbai; evidenceUrl=https://www.instagram.com/home_automation_panipat/',
            inboxStatus: 'new',
            enrichmentStatus: 'not_started',
            qualificationStatus: 'not_started',
        }, { city: 'Mumbai', crmStatus: 'New', verificationSummary: { status: 'Unverified' } });
        assert.equal(presented.instagram.searchLocation.toLowerCase(), 'mumbai');
        assert.equal(presented.instagram.city, 'Panipat');
        assert.notEqual(presented.instagram.city.toLowerCase(), 'mumbai');
        assert.equal(companyCityFromEvidence({ profileCity: 'Panipat', websiteCity: '' }), 'Panipat');
        assert.equal(companyCityFromEvidence({ profileCity: '', websiteCity: '' }), '');
        const evidence = rawCaptureToEvidence({
            source: 'instagram',
            title: 'home_automation_panipat',
            resultUrlNormalized: 'https://www.instagram.com/home_automation_panipat/',
            notes: 'source=instagram; location=mumbai',
            snippet: PANIPAT_SNIPPET,
        });
        assert.equal(evidence.location.toLowerCase(), 'mumbai');
        assert.equal(evidence.city, '');
    });

    it('keeps website enrichment provenance separate from Instagram', () => {
        const presented = presentSocialCapture({
            title: 'sensor_homeautomation',
            sourceRecordId: 'instagram:sensor_homeautomation',
            resultUrlNormalized: 'https://www.instagram.com/sensor_homeautomation/',
            snippet: SENSOR_SNIPPET,
            notes: 'source=instagram; website=https://sensorhomeautomation.in; websiteSource=instagram; location=mumbai',
            enrichmentStatus: 'completed',
        }, null, {}, {
            enrichmentStatus: 'partial',
            companyName: 'Sensor Home Automation',
            websiteUrl: 'https://sensorhomeautomation.in/',
            emails: [{ value: 'info@sensorhomeautomation.in' }],
            phones: [{ original: '+91 12345' }],
            city: 'Chennai',
            productsServices: ['Home automation'],
        });
        assert.equal(presented.instagram.websiteSource, 'Instagram');
        assert.equal(presented.websiteEnriched.status, 'partial');
        assert.equal(presented.websiteEnriched.email, 'info@sensorhomeautomation.in');
        assert.notEqual(presented.instagram.email, presented.websiteEnriched.email);
    });

    it('leaves missing website safe and does not invent a site', () => {
        const rec = {
            snippet: PANIPAT_SNIPPET,
            notes: 'source=instagram; keyword=Home Automation; location=mumbai',
        };
        stampInstagramWebsiteOnCandidate(rec);
        assert.equal(rec.website, undefined);
        assert.equal(extractWebsiteFromInstagramEvidence(rec), '');
        assert.doesNotMatch(rec.notes, /website=https?:/);
    });

    it('normalizes duplicate website forms to the same host', () => {
        const a = extractWebsiteFromInstagramEvidence({ snippet: 'www.gobrother.cn' });
        const b = extractWebsiteFromInstagramEvidence({ website: 'https://gobrother.cn/' });
        const c = extractWebsiteFromInstagramEvidence({ notes: 'website=https://www.gobrother.cn/about' });
        assert.equal(canonicalExternalWebsite(a).replace(/^https:\/\/www\./, 'https://'), 'https://gobrother.cn');
        assert.equal(canonicalExternalWebsite(b), 'https://gobrother.cn');
        assert.ok(canonicalExternalWebsite(c).includes('gobrother.cn'));
    });

    it('retains Instagram phone and address when no website exists', () => {
        const presented = presentSocialCapture({
            title: 'home_automation_panipat',
            sourceRecordId: 'instagram:home_automation_panipat',
            resultUrlNormalized: 'https://www.instagram.com/home_automation_panipat/',
            snippet: PANIPAT_SNIPPET,
            notes: 'source=instagram; keyword=Home Automation; location=mumbai',
            enrichmentStatus: 'not_started',
            qualificationStatus: 'not_started',
        });
        assert.match(presented.instagram.phone, /8059694896/);
        assert.match(presented.instagram.whatsapp, /wa\.me\/918059694896/);
        assert.match(presented.instagram.address, /Panipat/);
        assert.equal(presented.websiteEnriched.ran, false);
        assert.equal(presented.workflow.qualification, 'not_started');
    });

    it('does not auto-create a Lead', () => {
        const presented = presentSocialCapture({
            snippet: TUYA_SNIPPET,
            notes: 'source=instagram',
            sourceRecordId: 'instagram:tuyasmarthome',
            resultUrlNormalized: 'https://www.instagram.com/tuyasmarthome/',
            promotedExtractedLeadId: null,
        });
        assert.equal(presented.workflow.crm, 'New');
        assert.equal(presented.notes.includes('convertToLead'), false);
    });

    it('does not auto-verify', () => {
        const presented = presentSocialCapture({
            snippet: SENSOR_SNIPPET,
            notes: 'source=instagram',
            sourceRecordId: 'instagram:sensor_homeautomation',
            resultUrlNormalized: 'https://www.instagram.com/sensor_homeautomation/',
        }, { verificationSummary: { status: 'Unverified' } });
        assert.equal(presented.workflow.verification, 'Unverified');
        const rec = stampInstagramWebsiteOnCandidate({ snippet: SENSOR_SNIPPET, notes: 'source=instagram' });
        assert.equal(rec.qualificationStatus, undefined);
        assert.doesNotMatch(String(rec.notes), /verified=true|autoVerify/);
    });

    it('parses Instagram full-data display fields from stored snippet', () => {
        const presented = presentSocialCapture({
            title: 'sensor_homeautomation',
            sourceRecordId: 'instagram:sensor_homeautomation',
            resultUrlNormalized: 'https://www.instagram.com/sensor_homeautomation/',
            snippet: SENSOR_SNIPPET,
            notes: 'source=instagram; keyword=Home Automation; location=mumbai; searchType=business_profiles',
        });
        assert.equal(presented.instagram.username, 'sensor_homeautomation');
        assert.equal(presented.instagram.city, 'Chennai');
        assert.match(presented.instagram.website, /sensorhomeautomation\.in/);
        assert.equal(presented.instagram.source, 'Instagram');
    });

    it('mergeWebsiteIntoStoredNotes does not rewrite an existing website value', () => {
        const notes = 'source=instagram; website=https://sensorhomeautomation.in; websiteSource=instagram';
        const next = mergeWebsiteIntoStoredNotes(notes, 'https://www.gobrother.cn');
        assert.match(next, /website=https:\/\/sensorhomeautomation\.in/);
        assert.doesNotMatch(next, /website=https:\/\/www\.gobrother\.cn/);
    });
});
