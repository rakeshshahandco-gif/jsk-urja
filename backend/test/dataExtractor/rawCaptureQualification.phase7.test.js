/**
 * Checkpoint 7 — qualification rule engine + service tests (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../src/models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification, RawCaptureQualificationJob } from '../../src/models/rawCaptureQualification.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { qualifyWithRules, computeContactQuality } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/ruleEngine.js';
import { validateOllamaQualification } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/ollama.util.js';
import { buildQualificationWorkbook } from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/rawCaptureQualification.export.service.js';
import {
    startQualificationJob,
    listQualificationsForSession,
    updateOwnerReview,
    qualifyOneEnrichment,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureQualification/rawCaptureQualification.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `CP7-${Date.now()}`;
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

const campaignHints = {
    product: 'Home Automation',
    targetIndustry: 'Home Automation',
    city: 'Mumbai',
    state: 'Maharashtra',
    name: 'home automation — mumbai',
};

describe('CP7 rule engine', () => {
    it('strong-matches clear home automation manufacturer evidence', () => {
        const result = qualifyWithRules({
            campaign: campaignHints,
            enrichment: {
                companyName: 'Acme Smart Homes',
                websiteUrl: 'https://acme-smart.test',
                productsServices: ['home automation systems', 'smart switch', 'Zigbee gateway'],
                manufacturerEvidence: 'We are a manufacturer of home automation products',
                businessType: 'manufacturer',
                city: 'Mumbai',
                phones: [{ original: '9812345678' }],
                emails: [{ value: 'sales@acme-smart.test' }],
                sourceEvidence: [
                    { field: 'products', value: 'smart switch Zigbee', sourceUrl: 'https://acme-smart.test/products' },
                ],
                pagesVisited: ['https://acme-smart.test/'],
            },
            captures: [{
                title: 'Acme Smart Homes — Home Automation Mumbai',
                snippet: 'Manufacturer of smart home automation and touch switches in Mumbai',
                resultUrlOriginal: 'https://acme-smart.test',
            }],
        });
        assert.equal(result.systemDecision, 'strong_match');
        assert.ok(result.relevanceScore >= 70);
        assert.ok(result.decisionReason);
        assert.ok(result.sourceEvidence.length);
        assert.equal(result.qualificationMethod, 'rule_based');
        assert.ok(result.productsMatched.length);
    });

    it('rejects industrial-only and job/course content', () => {
        const industrial = qualifyWithRules({
            campaign: campaignHints,
            enrichment: {
                companyName: 'PLC Factory Systems',
                websiteUrl: 'https://plc.test',
                productsServices: ['PLC', 'SCADA', 'industrial automation'],
                businessType: 'manufacturer',
                pagesVisited: ['https://plc.test'],
                sourceEvidence: [{ field: 'products', value: 'industrial automation PLC SCADA', sourceUrl: 'https://plc.test' }],
            },
            captures: [{ title: 'Industrial automation PLC', snippet: 'Factory automation SCADA solutions', resultUrlOriginal: 'https://plc.test' }],
        });
        assert.equal(industrial.systemDecision, 'rejected');

        const jobs = qualifyWithRules({
            campaign: campaignHints,
            enrichment: { companyName: 'Jobs Portal', websiteUrl: 'https://jobs.test', pagesVisited: ['https://jobs.test'] },
            captures: [{ title: 'Home Automation Engineer job opening Mumbai', snippet: 'Hiring recruitment vacancies', resultUrlOriginal: 'https://jobs.test' }],
        });
        assert.equal(jobs.systemDecision, 'rejected');
    });

    it('sends directory listings to human review', () => {
        const result = qualifyWithRules({
            campaign: campaignHints,
            enrichment: {
                companyName: 'Some Supplier on IndiaMART',
                isDirectorySource: true,
                websiteUrl: 'https://indiamart.com/x',
                businessType: 'marketplace_directory',
            },
            captures: [{ title: 'Home automation dealers', snippet: 'Directory listing', resultUrlOriginal: 'https://indiamart.com/x' }],
        });
        assert.equal(result.systemDecision, 'human_review_required');
        assert.equal(result.businessType, 'directory_marketplace');
    });

    it('does not reject distributors solely for business type', () => {
        const result = qualifyWithRules({
            campaign: campaignHints,
            enrichment: {
                companyName: 'Smart Distro',
                websiteUrl: 'https://smartdistro.test',
                productsServices: ['smart home', 'home automation controllers'],
                businessType: 'distributor',
                city: 'Mumbai',
                pagesVisited: ['https://smartdistro.test'],
                sourceEvidence: [{ field: 'products', value: 'home automation smart switch', sourceUrl: 'https://smartdistro.test' }],
            },
            captures: [{ title: 'Smart Distro Mumbai', snippet: 'Distributor of home automation and smart switches', resultUrlOriginal: 'https://smartdistro.test' }],
        });
        assert.ok(['strong_match', 'possible_match'].includes(result.systemDecision));
        assert.equal(result.businessType, 'distributor');
    });

    it('computes contact quality separately from relevance', () => {
        const cq = computeContactQuality({
            phones: [{ original: '1' }],
            emails: [{ value: 'a@b.c' }],
            websiteUrl: 'https://x.test',
        });
        assert.ok(cq.contactQualityScore > 0);
        assert.equal(cq.contactQualityBreakdown.phone, true);
        assert.equal(cq.contactQualityBreakdown.facebook, false);
    });

    it('rejects malformed Ollama JSON', () => {
        assert.equal(validateOllamaQualification(null), null);
        assert.equal(validateOllamaQualification({ systemDecision: 'maybe' }), null);
        const ok = validateOllamaQualification({
            systemDecision: 'possible_match',
            relevanceScore: 55,
            confidence: 'medium',
            decisionReason: 'partial smart lighting',
            businessType: 'dealer',
            locationMatch: 'partial',
            matchedKeywords: ['smart lighting'],
            productsMatched: ['smart lighting'],
        });
        assert.equal(ok.systemDecision, 'possible_match');
        assert.equal(ok.qualificationMethod, 'ollama_local');
    });
});

describe('CP7 service + export', () => {
    let enrichmentId;

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
            resultUrlOriginal: 'https://brighthome-cp7.test',
            resultUrlNormalized: 'https://brighthome-cp7.test/',
            displayDomain: 'brighthome-cp7.test',
            captureFingerprint: `${TAG}-fp`,
            enrichmentStatus: 'completed',
            firstCapturedBy: userId,
            lastCapturedBy: userId,
        });
        const en = await RawCaptureEnrichment.create({
            companyId,
            campaignId,
            sessionId,
            canonicalDomain: 'brighthome-cp7.test',
            websiteUrl: 'https://brighthome-cp7.test',
            companyName: 'Bright Home Automation',
            productsServices: ['home automation', 'smart switch'],
            manufacturerEvidence: 'OEM manufacturer of home automation',
            businessType: 'manufacturer',
            city: 'Mumbai',
            enrichmentStatus: 'completed',
            phones: [{ original: '9876543210', normalized: '919876543210', confidence: 'verified_from_tel_link', sourceUrl: 'https://brighthome-cp7.test' }],
            emails: [{ value: 'info@brighthome-cp7.test', kind: 'enquiry', sourceUrl: 'https://brighthome-cp7.test' }],
            rawCaptureIds: [capture._id],
            pagesVisited: ['https://brighthome-cp7.test/'],
            sourceEvidence: [{ field: 'products', value: 'home automation smart switch', sourceUrl: 'https://brighthome-cp7.test/products' }],
            createdBy: userId,
        });
        enrichmentId = en._id;
    });

    after(async () => {
        await RawCaptureQualification.deleteMany({ companyId });
        await RawCaptureQualificationJob.deleteMany({ companyId });
        await RawCaptureEnrichment.deleteMany({ companyId });
        await RawCapture.deleteMany({ companyId });
        await AssistedCaptureSession.deleteMany({ companyId });
        await SearchCampaign.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('upserts qualification without duplicates and preserves owner vs system decision', async () => {
        const campaign = await SearchCampaign.findById(campaignId).lean();
        const enrichment = await RawCaptureEnrichment.findById(enrichmentId).lean();
        const r1 = await qualifyOneEnrichment({
            companyId, campaignId, sessionId, enrichment, campaign, userId,
        });
        assert.ok(['strong_match', 'possible_match'].includes(r1.decision));
        const r2 = await qualifyOneEnrichment({
            companyId, campaignId, sessionId, enrichment, campaign, userId,
        });
        const count = await RawCaptureQualification.countDocuments({ companyId, campaignId, enrichmentId });
        assert.equal(count, 1);

        const listed = await listQualificationsForSession({ companyId, user, sessionId });
        assert.equal(listed.items.length, 1);
        const qid = listed.items[0]._id;
        const systemBefore = listed.items[0].systemDecision;

        const reviewed = await updateOwnerReview({
            companyId, user, sessionId, qualificationId: qid,
            body: { action: 'approve', ownerReviewNote: 'Owner ok' },
        });
        assert.equal(reviewed.qualification.ownerDecision, 'strong_match');
        assert.equal(reviewed.qualification.systemDecision, systemBefore);
        assert.equal(reviewed.systemDecisionPreserved, systemBefore);
        assert.equal(reviewed.createCrmLeadEnabled, false);
    });

    it('exports workbook with formula injection protection', async () => {
        const items = await RawCaptureQualification.find({ companyId }).lean();
        const ens = await RawCaptureEnrichment.find({ companyId }).lean();
        const caps = await RawCapture.find({ companyId }).lean();
        const evil = items.map((q) => ({ ...q, companyName: '=CMD()', decisionReason: '+1+1' }));
        const buf = await buildQualificationWorkbook({
            qualifications: evil,
            enrichments: ens,
            captures: caps,
            summary: { strongMatchCount: 1 },
            queryText: 'home automation mumbai',
        });
        assert.ok(Buffer.isBuffer(buf));
        assert.ok(buf.length > 1000);
    });

    it('job start is idempotent when already running and creates no leads', async () => {
        // Ensure no active job
        await RawCaptureQualificationJob.deleteMany({ companyId, sessionId, status: { $in: ['queued', 'processing'] } });
        const started = await startQualificationJob({
            companyId, user, sessionId, mode: 'all_enriched',
        });
        assert.ok(started.job);
        const again = await startQualificationJob({
            companyId, user, sessionId, mode: 'all_enriched',
        });
        assert.equal(again.alreadyRunning, true);
        // wait briefly for background job
        await new Promise((r) => setTimeout(r, 1500));
        const Lead = mongoose.models.Lead || null;
        if (Lead) {
            const leads = await Lead.countDocuments({ companyId, notes: new RegExp(TAG) });
            assert.equal(leads, 0);
        }
    });
});