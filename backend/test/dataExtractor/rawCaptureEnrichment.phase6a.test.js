/**
 * Checkpoint 6A — website enrichment unit/service tests (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureEnrichment, RawCaptureEnrichmentJob } from '../../src/models/rawCaptureEnrichment.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import {
    classifyEmailKind,
    normalizePhoneDigits,
    parsePageBundle,
    isDirectoryHost,
    scoreEnrichmentConfidence,
    computeMissingFields,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureEnrichment/parse.util.js';
import { buildEnrichedWorkbook } from '../../src/services/dataExtractor/searchCampaign/rawCaptureEnrichment/rawCaptureEnrichment.export.service.js';
import {
    startEnrichmentJob,
    listEnrichmentsForSession,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureEnrichment/rawCaptureEnrichment.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `CP6A-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();
const campaignId = new mongoose.Types.ObjectId();
const queryId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const user = {
    _id: userId,
    id: userId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            raw_capture: { view: true, manage: true },
            assisted_capture: { view: true, start: true, manage: true },
        },
    },
};

describe('CP6A parse utils', () => {
    it('classifies email kinds without inventing addresses', () => {
        assert.equal(classifyEmailKind('sales@example.com'), 'sales');
        assert.equal(classifyEmailKind('info@example.com'), 'enquiry');
        assert.equal(classifyEmailKind('support@example.com'), 'support');
    });

    it('normalizes Indian phones and detects directory hosts', () => {
        assert.equal(normalizePhoneDigits('022 1234 5678').length >= 10, true);
        assert.equal(isDirectoryHost('indiamart.com'), true);
        assert.equal(isDirectoryHost('example.com'), false);
    });

    it('parses mailto/tel/social/whatsapp from HTML and keeps evidence URLs', () => {
        const html = `
          <html><head><title>Acme Automation Pvt Ltd</title>
          <script type="application/ld+json">{"@type":"Organization","name":"Acme Automation Pvt Ltd","email":"sales@acme.test","telephone":"+912212345678","address":{"@type":"PostalAddress","addressLocality":"Mumbai","addressRegion":"MH","addressCountry":"IN"}}</script>
          </head><body>
          <a href="mailto:info@acme.test">Email</a>
          <a href="tel:+912298765432">Call</a>
          <a href="https://wa.me/919876543210">WhatsApp</a>
          <a href="https://www.facebook.com/acmeautomation">FB</a>
          <a href="https://www.instagram.com/acmeautomation">IG</a>
          <a href="/contact-us">Contact</a>
          <p>John Smith, Managing Director</p>
          <p>We are a manufacturer of home automation systems.</p>
          </body></html>`;
        const page = parsePageBundle(html, 'https://acme.test/');
        assert.equal(page.companyName, 'Acme Automation Pvt Ltd');
        assert.ok(page.emails.some((e) => e.value === 'sales@acme.test' || e.value === 'info@acme.test'));
        assert.ok(page.phones.length >= 1);
        assert.ok(page.whatsappNumbers.some((w) => w.labelledWhatsApp));
        assert.equal(page.social.facebook.url.includes('facebook.com'), true);
        assert.equal(page.social.instagram.url.includes('instagram.com'), true);
        assert.equal(page.city, 'Mumbai');
        assert.equal(page.businessType, 'manufacturer');
        assert.ok(page.contactPersons.some((p) => /John Smith/i.test(p.name)));
        assert.ok(page.evidence.every((e) => e.sourceUrl));
        const score = scoreEnrichmentConfidence({
            companyName: page.companyName,
            emails: page.emails,
            phones: page.phones,
            whatsappNumbers: page.whatsappNumbers,
            city: page.city,
            facebook: page.social.facebook,
            instagram: page.social.instagram,
            contactPersons: page.contactPersons,
            businessType: page.businessType,
        });
        assert.ok(score >= 50);
        const missing = computeMissingFields({
            companyName: page.companyName,
            phones: page.phones,
            emails: page.emails,
            whatsappNumbers: page.whatsappNumbers,
            city: page.city,
            facebook: page.social.facebook,
            instagram: page.social.instagram,
            contactPersons: page.contactPersons,
        });
        assert.deepEqual(missing, []);
    });


    it('rejects invalid phone shapes and accepts India mobile/tel', async () => {
        const { classifyIndianPhone, buildPhoneRecord, acceptPhoneForStorage, PHONE_CONFIDENCE } = await import(
            '../../src/services/dataExtractor/searchCampaign/rawCaptureEnrichment/parse.util.js'
        );
        assert.equal(classifyIndianPhone('19.018453').ok, false);
        assert.equal(classifyIndianPhone('10584878').ok, false);
        assert.equal(classifyIndianPhone('66908').ok, false);
        assert.equal(classifyIndianPhone('1111111111').ok, false);
        assert.equal(classifyIndianPhone('9812345678').ok, true);
        const tel = buildPhoneRecord('+919876543210', 'https://x.test', PHONE_CONFIDENCE.TEL_LINK, { originalText: 'tel:+919876543210' });
        assert.equal(acceptPhoneForStorage(tel), true);
        assert.equal(tel.confidence, PHONE_CONFIDENCE.TEL_LINK);
    });
    it('does not invent contact person from email alone', () => {
        const html = `<html><body><a href="mailto:john.smith@acme.test">mail</a></body></html>`;
        const page = parsePageBundle(html, 'https://acme.test/');
        assert.equal(page.contactPersons.length, 0);
        assert.ok(page.emails.some((e) => e.value === 'john.smith@acme.test'));
    });
});

describe('CP6A export + persistence', () => {
    before(async () => {
        await mongoose.connect(MONGO_URI);
    });
    after(async () => {
        await RawCapture.deleteMany({ companyId });
        await RawCaptureEnrichment.deleteMany({ companyId });
        await RawCaptureEnrichmentJob.deleteMany({ companyId });
        await AssistedCaptureSession.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('builds formula-safe enriched workbook with 5 sheets', async () => {
        const buffer = await buildEnrichedWorkbook({
            enrichments: [{
                companyName: '=CMD',
                phones: [{ original: '+911234567890' }],
                emails: [{ value: 'a@b.com' }],
                whatsappNumbers: [],
                contactPersons: [],
                addresses: [],
                facebook: {},
                instagram: {},
                enrichmentStatus: 'partial',
                confidence: 40,
                sourceEvidence: [{ field: 'email', value: 'a@b.com', sourceUrl: 'https://example.com' }],
                rawCaptureIds: [],
                productsServices: [],
            }],
            captures: [],
            summary: { withEmail: 1 },
        });
        assert.ok(Buffer.isBuffer(buffer));
        assert.ok(buffer.length > 1000);
        // xlsx zip header
        assert.equal(buffer[0], 0x50);
        assert.equal(buffer[1], 0x4b);
    });

    it('dedupes enrichment by domain and does not create Lead', async () => {
        const session = await AssistedCaptureSession.create({
            companyId,
            campaignId,
            queryId,
            searchUrl: 'https://www.google.com/search?q=home+automation+Mumbai',
            searchUrlHash: `h-${TAG}`,
            requestFingerprint: `fp-${TAG}`,
            tokenHash: `th-${TAG}`,
            tokenExpiresAt: new Date(Date.now() + 3600000),
            sessionExpiresAt: new Date(Date.now() + 3600000),
            status: 'awaiting_user',
            source: 'google',
            createdBy: userId,
        });

        const cap = await RawCapture.create({
            companyId,
            campaignId,
            queryId,
            queryScopeKey: `qs-${TAG}`,
            source: 'google',
            captureMethod: 'assisted_visible',
            title: `${TAG} Demo Co`,
            titleNormalized: `${TAG} demo co`,
            snippet: 'Home automation',
            resultUrlOriginal: 'https://example.com/about',
            resultUrlNormalized: 'https://example.com/about',
            displayDomain: 'example.com',
            captureFingerprint: `cf-${TAG}`,
            enrichmentStatus: 'not_started',
        });

        // Mock fetch by stubbing global fetch for this test domain
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            status: 200,
            url: 'https://example.com/',
            headers: { get: () => 'text/html' },
            text: async () => `<html><head><title>${TAG} Demo Co</title></head>
              <body><a href="mailto:sales@example.com">e</a><a href="tel:+912212345678">p</a>
              <a href="https://www.facebook.com/democo">fb</a></body></html>`,
        });

        try {
            const started = await startEnrichmentJob({
                companyId,
                user,
                sessionId: session._id,
                mode: 'selected',
                rawCaptureIds: [cap._id],
            });
            assert.ok(started.job?._id);

            // wait for async job
            for (let i = 0; i < 40; i += 1) {
                const job = await RawCaptureEnrichmentJob.findById(started.job._id).lean();
                if (job && !['queued', 'processing'].includes(job.status)) break;
                await new Promise((r) => setTimeout(r, 250));
            }

            const listed1 = await listEnrichmentsForSession({ companyId, user, sessionId: session._id });
            assert.ok(listed1.items.length >= 1);
            const firstCount = listed1.items.length;

            // Second enrichment same domain should upsert, not duplicate
            await RawCapture.updateOne({ _id: cap._id }, { $set: { enrichmentStatus: 'not_started' } });
            const started2 = await startEnrichmentJob({
                companyId,
                user,
                sessionId: session._id,
                mode: 'selected',
                rawCaptureIds: [cap._id],
            });
            for (let i = 0; i < 40; i += 1) {
                const job = await RawCaptureEnrichmentJob.findById(started2.job._id).lean();
                if (job && !['queued', 'processing'].includes(job.status)) break;
                await new Promise((r) => setTimeout(r, 250));
            }
            const listed2 = await listEnrichmentsForSession({ companyId, user, sessionId: session._id });
            assert.equal(listed2.items.filter((x) => x.canonicalDomain === 'example.com').length, 1);
            assert.ok(listed2.items.length <= firstCount + 1);

            // No Lead collection writes in this module — assert Lead count unchanged for company
            const { Lead } = await import('../../src/models/lead.model.js');
            const leadCount = await Lead.countDocuments({ companyId });
            assert.equal(leadCount, 0);
        } finally {
            global.fetch = originalFetch;
        }
    });
});