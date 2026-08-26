import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicQualify, understandSearchIntent } from '../src/services/dataExtractor/discovery/phase2/heuristicQualify.util.js';
import { qualifyCompany } from '../src/services/dataExtractor/discovery/phase2/aiQualify.util.js';
import { buildQualificationInput } from '../src/services/dataExtractor/discovery/phase2/inputPayload.util.js';

describe('phase2 heuristic qualification', () => {
    it('understands search intent generically', () => {
        const home = understandSearchIntent('Home Automation', 'Mumbai');
        assert.ok(home.summary.toLowerCase().includes('home automation'));
        const led = understandSearchIntent('LED Driver', 'India');
        assert.ok(led.summary.toLowerCase().includes('led driver'));
        assert.ok(!led.summary.toLowerCase().includes('home automation'));
    });

    it('scores a genuine home automation integrator highly', () => {
        const job = { keyword: 'Home Automation', city: 'Mumbai' };
        const { payload } = buildQualificationInput({
            job,
            record: {
                companyName: 'ABC Smart Home Pvt Ltd',
                website: 'https://abcsmart.in',
                normalizedDomain: 'abcsmart.in',
                city: 'Mumbai',
                email: 'sales@abcsmart.in',
                phone: '9876543210',
                businessDescription: 'Home automation system integrator for residential projects. KNX and smart lighting, smart switches.',
                websiteTitle: 'ABC Smart Home | Home Automation Mumbai',
                aboutPageText: 'We design and install home automation and smart lighting in Mumbai.',
            },
        });
        const q = heuristicQualify({ job, payload });
        assert.ok(q.score >= 70, `expected high score, got ${q.score} ${q.category}`);
        assert.ok(['Highly Relevant', 'Relevant'].includes(q.category), q.category);
        assert.ok(q.evidence.length >= 2);
        assert.ok(!/invent|gstin|revenue/i.test(q.evidence.join(' ')));
    });

    it('scores industrial automation lower for Home Automation search', () => {
        const job = { keyword: 'Home Automation', city: 'Mumbai' };
        const { payload } = buildQualificationInput({
            job,
            record: {
                companyName: 'PQR Factory Automation',
                website: 'https://pqr-industrial.com',
                normalizedDomain: 'pqr-industrial.com',
                city: 'Pune',
                businessDescription: 'Industrial factory automation, PLC and SCADA systems for manufacturing plants. Robotic automation.',
                websiteTitle: 'Industrial Automation | PLC SCADA',
            },
        });
        const q = heuristicQualify({ job, payload });
        assert.ok(q.score < 70, `industrial should not score high, got ${q.score} ${q.category}`);
        assert.ok(['Possibly Relevant', 'Not Relevant', 'Insufficient Information'].includes(q.category), q.category);
    });

    it('is not hard-coded — LED Driver manufacturers score high', () => {
        const job = { keyword: 'LED Driver', city: '', country: 'India' };
        const { payload } = buildQualificationInput({
            job,
            record: {
                companyName: 'Delta Power Electronics',
                website: 'https://deltadriver.example',
                normalizedDomain: 'deltadriver.example',
                businessDescription: 'LED driver manufacturer and OEM supplier of constant current LED power supplies for lighting.',
                websiteTitle: 'LED Driver Manufacturer India',
                productPageText: 'We manufacture LED drivers and electronic power supplies.',
            },
        });
        const q = heuristicQualify({ job, payload });
        assert.ok(q.score >= 70, `LED driver should score high, got ${q.score}`);
        assert.ok(q.companyTypes.includes('Manufacturer') || q.companyTypes.includes('OEM'));
        assert.ok(!q.evidence.join(' ').toLowerCase().includes('home automation'));
    });

    it('treats thin article-like results as weak / insufficient', () => {
        const job = { keyword: 'Home Automation' };
        const { payload } = buildQualificationInput({
            job,
            record: {
                companyName: 'What is Home Automation',
                website: 'https://en.wikipedia.org/wiki/Home_automation',
                websiteTitle: 'What is home automation — Wikipedia',
                snippet: 'An article about home automation.',
            },
        });
        const q = heuristicQualify({ job, payload });
        assert.ok(q.score < 70, `article should not be a qualified company, got ${q.score} ${q.category}`);
    });

    it('falls back when AI is unavailable without throwing', async () => {
        const job = { keyword: 'Textile Machinery' };
        const { payload } = buildQualificationInput({
            job,
            record: { companyName: 'Loom Tech', businessDescription: 'Textile machinery manufacturer' },
        });
        const q = await qualifyCompany({ job, payload, forceUnavailable: true });
        assert.equal(q.aiAvailable, false);
        assert.ok(q.score >= 0);
        assert.ok(q.evidence.length);
        assert.match(q.fallbackReason, /unavailable/i);
    });
});
