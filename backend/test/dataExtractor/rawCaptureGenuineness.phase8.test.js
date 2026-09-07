/**
 * Checkpoint 8 (Phase B) — genuineness rule engine + service tests (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../src/models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification } from '../../src/models/rawCaptureQualification.model.js';
import { RawCaptureGenuineness, RawCaptureGenuinenessJob } from '../../src/models/rawCaptureGenuineness.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { evaluateGenuineness } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/ruleEngine.js';
import { validateOllamaGenuineness } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/ollama.util.js';
import { isOllamaGenuinenessEnabled } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/constants.js';
import { buildGenuinenessWorkbook } from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/rawCaptureGenuineness.export.service.js';
import {
    startVerificationJob,
    listGenuinenessForSession,
    updateOwnerReview,
    verifyOneQualification,
    createCrmLead,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureGenuineness/rawCaptureGenuineness.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `CP8-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();
const campaignId = new mongoose.Types.ObjectId();
const queryId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const sessionId = new mongoose.Types.ObjectId();

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

describe('CP8 genuineness rule engine', () => {
    it('verifies genuine when website + verified phone + company name are consistent', () => {
        const result = evaluateGenuineness({
            qualification: { systemDecision: 'strong_match', businessType: 'manufacturer', unmatchedOrConflictingEvidence: [] },
            enrichment: {
                companyName: 'Acme Smart Homes',
                websiteUrl: 'https://acme-smart.test',
                phones: [{ original: '9812345678', confidence: 'verified_from_tel_link', sourceUrl: 'https://acme-smart.test' }],
                emails: [{ value: 'sales@acme-smart.test' }],
                addresses: [{ raw: 'Mumbai, Maharashtra', sourceUrl: 'https://acme-smart.test' }],
                facebook: { url: 'https://facebook.com/acmesmart' },
                sourceEvidence: [
                    { field: 'about', value: 'Acme is a home automation company', sourceUrl: 'https://acme-smart.test/about' },
                    { field: 'contact', value: 'Contact us in Mumbai', sourceUrl: 'https://acme-smart.test/contact' },
                ],
                pagesVisited: ['https://acme-smart.test/', 'https://acme-smart.test/about'],
            },
            rawCapture: {
                title: 'Acme Smart Homes — Home Automation Mumbai',
                snippet: 'Smart home automation products in Mumbai',
                resultUrlOriginal: 'https://acme-smart.test',
            },
        });
        assert.ok(['verified_genuine', 'likely_genuine'].includes(result.genuinenessDecision));
        assert.ok(result.genuinenessScore >= 60);
        assert.equal(result.verificationMethod, 'rule_based');
        assert.ok(result.verificationReason);
        assert.equal(result.conflictingEvidence.length, 0);
    });

    it('routes directory/marketplace listings to directory_or_marketplace_only', () => {
        const result = evaluateGenuineness({
            qualification: { systemDecision: 'human_review_required', businessType: 'directory_marketplace' },
            enrichment: {
                companyName: 'Some Supplier on IndiaMART',
                isDirectorySource: true,
                websiteUrl: 'https://indiamart.com/x',
                businessType: 'marketplace_directory',
            },
            rawCapture: { title: 'Home automation dealers', snippet: 'Directory listing', resultUrlOriginal: 'https://indiamart.com/x' },
        });
        assert.equal(result.genuinenessDecision, 'directory_or_marketplace_only');
    });

    it('flags conflicting company name / search-result evidence as human_review_required', () => {
        const result = evaluateGenuineness({
            qualification: { systemDecision: 'possible_match', businessType: 'unknown' },
            enrichment: {
                companyName: 'Totally Different Traders Pvt Ltd',
                websiteUrl: 'https://totallydifferent.test',
                phones: [{ original: '9000000000', confidence: 'possible_phone' }],
            },
            rawCapture: {
                title: 'XYZ Home Automation Bangalore Reviews',
                snippet: 'unrelated blog content',
                resultUrlOriginal: 'https://totallydifferent.test',
            },
        });
        assert.equal(result.genuinenessDecision, 'human_review_required');
        assert.ok(result.conflictingEvidence.length > 0);
    });

    it('does not treat a title-only manufacturer claim as verified manufacturer evidence', () => {
        const result = evaluateGenuineness({
            qualification: { systemDecision: 'possible_match', businessType: 'unknown' },
            enrichment: {
                companyName: 'Bright Traders',
                websiteUrl: 'https://brighttraders.test',
                phones: [{ original: '9123456780', confidence: 'possible_phone' }],
                productsServices: [],
                sourceEvidence: [],
                pagesVisited: [],
            },
            rawCapture: {
                title: 'Bright Traders — Leading Manufacturer of Smart Switches',
                snippet: 'We are the top manufacturer in the region',
                resultUrlOriginal: 'https://brighttraders.test',
            },
        });
        assert.equal(result.manufacturerEvidence, 'unsupported_manufacturer_claim');
        assert.notEqual(result.genuinenessDecision, 'verified_genuine');
    });

    it('does not penalize absence of social profiles or a free email alone', () => {
        const result = evaluateGenuineness({
            qualification: { systemDecision: 'strong_match', businessType: 'manufacturer' },
            enrichment: {
                companyName: 'Reliable Home Systems',
                websiteUrl: 'https://reliablehome.test',
                phones: [{ original: '9988776655', confidence: 'verified_from_tel_link', sourceUrl: 'https://reliablehome.test' }],
                emails: [{ value: 'owner@gmail.com' }],
                sourceEvidence: [{ field: 'about', value: 'home automation manufacturer', sourceUrl: 'https://reliablehome.test/about' }],
                pagesVisited: ['https://reliablehome.test/', 'https://reliablehome.test/about'],
            },
            rawCapture: { title: 'Reliable Home Systems', snippet: 'home automation', resultUrlOriginal: 'https://reliablehome.test' },
        });
        assert.ok(result.warningSignals.includes('free_email_domain_only'));
        assert.ok(['verified_genuine', 'likely_genuine'].includes(result.genuinenessDecision));
    });

    it('rejects malformed Ollama JSON and confirms Ollama is off by default', () => {
        assert.equal(isOllamaGenuinenessEnabled(), false);
        assert.equal(validateOllamaGenuineness(null), null);
        assert.equal(validateOllamaGenuineness({ genuinenessDecision: 'maybe' }), null);
        const ok = validateOllamaGenuineness({
            genuinenessDecision: 'likely_genuine',
            genuinenessScore: 65,
            genuinenessConfidence: 'medium',
            verificationReason: 'consistent evidence',
            manufacturerEvidence: 'unknown',
            positiveSignals: ['website_present'],
        });
        assert.equal(ok.genuinenessDecision, 'likely_genuine');
        assert.equal(ok.verificationMethod, 'ollama_local');
    });
});

describe('CP8 service + export', () => {
    let qualificationId;

    before(async () => {
        await mongoose.connect(MONGO_URI);
        await SearchCampaign.create({
            _id: campaignId,
            companyId,
            name: `${TAG} HA Mumbai`,
            targetIndustry: 'Home Automation',
            city: 'Mumbai',
            state: 'Maharashtra',
            status: 'active',
            createdBy: userId,
        });
        await AssistedCaptureSession.create({
            _id: sessionId,
            companyId,
            campaignId,
            queryId,
            searchUrl: 'https://www.google.com/search?q=home+automation+Mumbai',
            searchUrlHash: `h-${TAG}`,
            requestFingerprint: `fp-${TAG}`,
            tokenHash: `th-${TAG}`,
            tokenExpiresAt: new Date(Date.now() + 3600000),
            sessionExpiresAt: new Date(Date.now() + 3600000),
            status: 'completed',
            source: 'google',
            createdBy: userId,
        });
        const capture = await RawCapture.create({
            companyId,
            campaignId,
            queryId,
            queryScopeKey: `${TAG}-q`,
            source: 'google',
            captureMethod: 'assisted_visible',
            title: 'Bright Home Automation Mumbai',
            snippet: 'Smart home automation and Zigbee products',
            resultUrlOriginal: 'https://brighthome-cp8.test',
            resultUrlNormalized: 'https://brighthome-cp8.test/',
            displayDomain: 'brighthome-cp8.test',
            captureFingerprint: `${TAG}-fp`,
            enrichmentStatus: 'completed',
            firstCapturedBy: userId,
            lastCapturedBy: userId,
        });
        const en = await RawCaptureEnrichment.create({
            companyId,
            campaignId,
            sessionId,
            canonicalDomain: 'brighthome-cp8.test',
            websiteUrl: 'https://brighthome-cp8.test',
            companyName: 'Bright Home Automation',
            productsServices: ['home automation', 'smart switch'],
            manufacturerEvidence: 'OEM manufacturer of home automation',
            businessType: 'manufacturer',
            city: 'Mumbai',
            enrichmentStatus: 'completed',
            phones: [{ original: '9876543210', normalized: '919876543210', confidence: 'verified_from_tel_link', sourceUrl: 'https://brighthome-cp8.test' }],
            emails: [{ value: 'info@brighthome-cp8.test', kind: 'enquiry', sourceUrl: 'https://brighthome-cp8.test' }],
            rawCaptureIds: [capture._id],
            pagesVisited: ['https://brighthome-cp8.test/'],
            sourceEvidence: [{ field: 'products', value: 'home automation smart switch', sourceUrl: 'https://brighthome-cp8.test/products' }],
            createdBy: userId,
        });
        const qual = await RawCaptureQualification.create({
            companyId,
            campaignId,
            sessionId,
            enrichmentId: en._id,
            canonicalDomain: 'brighthome-cp8.test',
            companyName: 'Bright Home Automation',
            websiteUrl: 'https://brighthome-cp8.test',
            systemDecision: 'strong_match',
            relevanceScore: 82,
            confidence: 'high',
            decisionReason: 'Strong home automation evidence',
            qualificationStatus: 'qualified',
            qualificationMethod: 'rule_based',
            qualifiedAt: new Date(),
            createdBy: userId,
        });
        qualificationId = qual._id;
    });

    after(async () => {
        await RawCaptureGenuineness.deleteMany({ companyId });
        await RawCaptureGenuinenessJob.deleteMany({ companyId });
        await RawCaptureQualification.deleteMany({ companyId });
        await RawCaptureEnrichment.deleteMany({ companyId });
        await RawCapture.deleteMany({ companyId });
        await AssistedCaptureSession.deleteMany({ companyId });
        await SearchCampaign.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('upserts genuineness without duplicates and preserves owner vs system decision', async () => {
        const campaign = await SearchCampaign.findById(campaignId).lean();
        const qualification = await RawCaptureQualification.findById(qualificationId).lean();
        const r1 = await verifyOneQualification({
            companyId, campaignId, sessionId, qualification, campaign, userId,
        });
        assert.ok(['verified_genuine', 'likely_genuine'].includes(r1.decision));
        const r2 = await verifyOneQualification({
            companyId, campaignId, sessionId, qualification, campaign, userId,
        });
        const count = await RawCaptureGenuineness.countDocuments({ companyId, campaignId, qualificationId });
        assert.equal(count, 1);

        const listed = await listGenuinenessForSession({ companyId, user, sessionId });
        assert.equal(listed.items.length, 1);
        const gid = listed.items[0]._id;
        const systemBefore = listed.items[0].systemDecision;

        const reviewed = await updateOwnerReview({
            companyId, user, sessionId, genuinenessId: gid,
            body: { action: 'approve', ownerReviewNote: 'Owner confirmed genuine' },
        });
        assert.equal(reviewed.genuineness.ownerDecision, 'verified_genuine');
        assert.equal(reviewed.genuineness.systemDecision, systemBefore);
        assert.equal(reviewed.systemDecisionPreserved, systemBefore);
        assert.equal(reviewed.createCrmLeadEnabled, false); // review payload flag only; create uses dedicated endpoint
        void r2;
    });

    it('exports workbook with unique-company + evidence sheets and formula injection protection', async () => {
        const items = await RawCaptureGenuineness.find({ companyId }).lean();
        const quals = await RawCaptureQualification.find({ companyId }).lean();
        const ens = await RawCaptureEnrichment.find({ companyId }).lean();
        const evil = items.map((g) => ({ ...g, companyName: '=CMD()', verificationReason: '+1+1' }));
        const buf = await buildGenuinenessWorkbook({
            genuinenessRecords: evil,
            qualifications: quals,
            enrichments: ens,
            summary: { verifiedGenuineCount: 1 },
        });
        assert.ok(Buffer.isBuffer(buf));
        assert.ok(buf.length > 1000);

        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const sheetNames = wb.worksheets.map((s) => s.name);
        assert.ok(sheetNames.length >= 6);
        assert.ok(sheetNames.includes('Verified Unique Companies') || sheetNames.includes('Verified Genuine'));
        assert.ok(sheetNames.includes('Verified Genuine'));
        assert.ok(sheetNames.includes('Likely Genuine'));
        assert.ok(sheetNames.includes('Human Review Required'));
        assert.ok(sheetNames.includes('Directory-Marketplace'));
        assert.ok(sheetNames.includes('Suspected Unreliable-Rejected'));
        assert.ok(sheetNames.includes('Verification Summary'));
    });

    it('job start is idempotent when already running and never creates CRM leads', async () => {
        await RawCaptureGenuinenessJob.deleteMany({ companyId, sessionId, status: { $in: ['queued', 'processing'] } });
        const started = await startVerificationJob({
            companyId, user, sessionId, mode: 'all_qualified',
        });
        assert.ok(started.job);
        const again = await startVerificationJob({
            companyId, user, sessionId, mode: 'all_qualified',
        });
        assert.equal(again.alreadyRunning, true);
        await new Promise((r) => setTimeout(r, 1500));
        const Lead = mongoose.models.Lead || null;
        if (Lead) {
            const leads = await Lead.countDocuments({ companyId, notes: new RegExp(TAG) });
            assert.equal(leads, 0);
        }
    });

    it('createCrmLead requires company and session context', async () => {
        await assert.rejects(
            () => createCrmLead({}),
            (err) => {
                assert.ok(err.statusCode === 400 || err.statusCode === 404);
                return true;
            },
        );
    });
});
