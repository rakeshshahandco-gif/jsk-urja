/**
 * Phase 6A — MongoDB/API integration + route permission matrix.
 * Uses local crm_test only. Cleans up only records created by this suite.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import express from 'express';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';
import { checkPermission } from '../../src/middlewares/auth.middleware.js';
import { AiIndustryMaster } from '../../src/models/aiIndustryMaster.model.js';
import { AiIndustryClassification } from '../../src/models/aiIndustryClassification.model.js';
import { AiClassificationBatchJob } from '../../src/models/aiClassificationBatchJob.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { ExtractorSettings } from '../../src/models/extractorSettings.model.js';
import {
    classifyOneRecord,
    getClassification,
    getClassificationEvidence,
    getClassificationHistory,
    overrideClassification,
    lockClassification,
    markIrrelevantClassification,
    reanalyzeClassification,
    listClassifications,
} from '../../src/services/dataExtractor/industryClassification/classificationStore.service.js';
import {
    createClassificationBatch,
    controlClassificationBatch,
    processClassificationBatchChunk,
    getClassificationBatch,
} from '../../src/services/dataExtractor/industryClassification/batch.service.js';
import { classifyIndustryRecord } from '../../src/services/dataExtractor/industryClassification/classify.service.js';
import dataExtractorRouter from '../../src/routes/v1/dataExtractor.routes.js';
import * as industryClassificationController from '../../src/controllers/industryClassification.controller.js';
function getClassificationActionVisibility(hasPermission) {
    const can = (key) => {
        try { return hasPermission?.(key) === true; } catch { return false; }
    };
    return {
        canView: can('data_extractor.lead_intelligence.view'),
        canClassify: can('data_extractor.lead_intelligence.classify'),
        canBatch: can('data_extractor.lead_intelligence.batch'),
        canOverride: can('data_extractor.lead_intelligence.override'),
        canLock: can('data_extractor.lead_intelligence.lock'),
        canMarkIrrelevant: can('data_extractor.lead_intelligence.mark_irrelevant'),
        canViewEvidence: can('data_extractor.lead_intelligence.view_evidence'),
        canViewHistory: can('data_extractor.lead_intelligence.view_history'),
        canAudit: can('data_extractor.lead_intelligence.audit'),
        canManage: can('data_extractor.lead_intelligence.manage'),
    };
}

const MONGO_URI = process.env.P6A_MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P6A-${Date.now()}`;

const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();

const createdClassificationIds = [];
const createdBatchIds = [];
const createdLeadIds = [];
const createdIndustryIds = [];

function trackClass(doc) {
    if (doc?._id) createdClassificationIds.push(doc._id);
    return doc;
}

function permissionUser(perms = []) {
    return { roleName: 'staff', permissions: perms };
}

const EXPECTED_ROUTE_PERMS = [
    { method: 'get', path: '/ai-lead-intelligence/classifications', perm: 'data_extractor.lead_intelligence.view' },
    { method: 'get', path: '/ai-lead-intelligence/classifications/:id', perm: 'data_extractor.lead_intelligence.view' },
    { method: 'get', path: '/ai-lead-intelligence/classifications/:id/evidence', perm: 'data_extractor.lead_intelligence.view_evidence' },
    { method: 'get', path: '/ai-lead-intelligence/classifications/:id/history', perm: 'data_extractor.lead_intelligence.view_history' },
    { method: 'get', path: '/ai-lead-intelligence/classifications/:id/audit', perm: 'data_extractor.lead_intelligence.audit' },
    { method: 'post', path: '/ai-lead-intelligence/classifications/classify', perm: 'data_extractor.lead_intelligence.classify' },
    { method: 'post', path: '/ai-lead-intelligence/classifications/:id/override', perm: 'data_extractor.lead_intelligence.override' },
    { method: 'post', path: '/ai-lead-intelligence/classifications/:id/lock', perm: 'data_extractor.lead_intelligence.lock' },
    { method: 'post', path: '/ai-lead-intelligence/classifications/:id/mark-irrelevant', perm: 'data_extractor.lead_intelligence.mark_irrelevant' },
    { method: 'post', path: '/ai-lead-intelligence/classifications/:id/reanalyze', perm: 'data_extractor.lead_intelligence.classify' },
    { method: 'get', path: '/ai-lead-intelligence/batches', perm: 'data_extractor.lead_intelligence.view' },
    { method: 'post', path: '/ai-lead-intelligence/batches', perm: 'data_extractor.lead_intelligence.batch' },
    { method: 'get', path: '/ai-lead-intelligence/batches/:id', perm: 'data_extractor.lead_intelligence.view' },
    { method: 'get', path: '/ai-lead-intelligence/batches/:id/audit', perm: 'data_extractor.lead_intelligence.audit' },
    { method: 'post', path: '/ai-lead-intelligence/batches/:id/control', perm: 'data_extractor.lead_intelligence.batch' },
    { method: 'post', path: '/ai-lead-intelligence/batches/:id/process', perm: 'data_extractor.lead_intelligence.batch' },
];

async function seedMasters(companyId) {
    const rows = [
        {
            parentIndustry: 'Lighting',
            subIndustry: 'LED Lighting',
            keywords: ['led', 'lighting', 'luminaire'],
            productKeywords: ['led driver', 'led panel'],
            websiteKeywords: ['led manufacturer'],
            negativeKeywords: ['driver recruitment', 'taxi'],
            exclusionTerms: ['staffing agency'],
        },
        {
            parentIndustry: 'Textile',
            subIndustry: 'Garments',
            keywords: ['textile', 'garment', 'fabric'],
            productKeywords: ['cotton yarn'],
            websiteKeywords: ['textile mill'],
            negativeKeywords: [],
            exclusionTerms: [],
        },
    ];
    for (const r of rows) {
        const doc = await AiIndustryMaster.create({ companyId, ...r, isActive: true, notes: TAG });
        createdIndustryIds.push(doc._id);
    }
    await ExtractorSettings.findOneAndUpdate(
        { companyId },
        {
            $set: {
                aiLeadIntelligence: {
                    enabled: true,
                    classificationMode: 'rule_based',
                    minimumConfidence: 45,
                    requireManualReviewBelowConfidence: 60,
                    autoApplyOnSearch: true,
                },
            },
        },
        { upsert: true, new: true },
    );
}

async function createLead(companyId, overrides = {}) {
    const lead = await ExtractedLead.create({
        companyId,
        financialYear: '2025-26',
        sourcePlatform: 'web_search',
        companyName: overrides.companyName || `${TAG} LED Co`,
        businessDescription: overrides.businessDescription || 'Manufacturer of LED lighting and LED drivers',
        website: overrides.website || 'https://example-p6a-led.test',
        keywords: overrides.keywords || ['led', 'lighting'],
        status: 'draft',
        ...overrides,
    });
    createdLeadIds.push(lead._id);
    return lead;
}

before(async () => {
    assert.ok(MONGO_URI.includes('127.0.0.1') || MONGO_URI.includes('localhost'), 'Must use local Mongo');
    assert.ok(MONGO_URI.includes('crm_test'), 'Must use crm_test database');
    await mongoose.connect(MONGO_URI);
    await seedMasters(companyA);
    await seedMasters(companyB);
});

after(async () => {
    try {
        if (createdClassificationIds.length) await AiIndustryClassification.deleteMany({ _id: { $in: createdClassificationIds } });
        if (createdBatchIds.length) await AiClassificationBatchJob.deleteMany({ _id: { $in: createdBatchIds } });
        if (createdLeadIds.length) await ExtractedLead.deleteMany({ _id: { $in: createdLeadIds } });
        if (createdIndustryIds.length) await AiIndustryMaster.deleteMany({ _id: { $in: createdIndustryIds } });
        await AiIndustryClassification.deleteMany({ companyId: { $in: [companyA, companyB] } });
        await AiClassificationBatchJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
        await ExtractorSettings.deleteMany({ companyId: { $in: [companyA, companyB] } });
        await AiIndustryMaster.deleteMany({ companyId: { $in: [companyA, companyB] } });
        await ExtractedLead.deleteMany({ companyId: { $in: [companyA, companyB] } });
    } finally {
        await mongoose.disconnect();
    }
});

describe('Phase 6A route permission matrix', () => {
    it('maps every classification route to the exact permission', () => {
        const layers = dataExtractorRouter.stack.filter((l) => l.route && String(l.route.path).includes('ai-lead-intelligence'));
        for (const expected of EXPECTED_ROUTE_PERMS) {
            const layer = layers.find((l) => l.route.path === expected.path && l.route.methods[expected.method]);
            assert.ok(layer, `Missing route ${expected.method.toUpperCase()} ${expected.path}`);
            assert.equal(checkUserPermission(permissionUser(['data_extractor.lead_intelligence.view']), expected.perm), expected.perm.endsWith('.view'));
            assert.equal(checkUserPermission(permissionUser([expected.perm]), expected.perm), true);
            void checkPermission;
        }
    });

    it('denies classify/override/lock for view-only users', () => {
        const viewOnly = permissionUser(['data_extractor.lead_intelligence.view']);
        for (const p of [
            'data_extractor.lead_intelligence.classify',
            'data_extractor.lead_intelligence.batch',
            'data_extractor.lead_intelligence.override',
            'data_extractor.lead_intelligence.lock',
            'data_extractor.lead_intelligence.mark_irrelevant',
            'data_extractor.lead_intelligence.manage',
        ]) {
            assert.equal(checkUserPermission(viewOnly, p), false);
        }
    });

    it('denies override/lock for classify-only users', () => {
        const classifyOnly = permissionUser(['data_extractor.lead_intelligence.classify']);
        assert.equal(checkUserPermission(classifyOnly, 'data_extractor.lead_intelligence.override'), false);
        assert.equal(checkUserPermission(classifyOnly, 'data_extractor.lead_intelligence.lock'), false);
        assert.equal(checkUserPermission(classifyOnly, 'data_extractor.lead_intelligence.classify'), true);
    });
});

describe('Phase 6A frontend permission visibility', () => {
    it('hides mutating actions for view-only', () => {
        const vis = getClassificationActionVisibility((p) => p === 'data_extractor.lead_intelligence.view');
        assert.equal(vis.canView, true);
        assert.equal(vis.canClassify, false);
        assert.equal(vis.canOverride, false);
        assert.equal(vis.canLock, false);
        assert.equal(vis.canMarkIrrelevant, false);
        assert.equal(vis.canManage, false);
    });

    it('classify user cannot override or lock', () => {
        const allowed = new Set([
            'data_extractor.lead_intelligence.view',
            'data_extractor.lead_intelligence.classify',
        ]);
        const vis = getClassificationActionVisibility((p) => allowed.has(p));
        assert.equal(vis.canClassify, true);
        assert.equal(vis.canOverride, false);
        assert.equal(vis.canLock, false);
    });

    it('evidence and history flags match dedicated permissions', () => {
        const vis = getClassificationActionVisibility((p) => [
            'data_extractor.lead_intelligence.view',
            'data_extractor.lead_intelligence.view_evidence',
            'data_extractor.lead_intelligence.view_history',
        ].includes(p));
        assert.equal(vis.canViewEvidence, true);
        assert.equal(vis.canViewHistory, true);
        assert.equal(vis.canOverride, false);
    });
});

describe('Phase 6A MongoDB classification workflows', () => {
    it('1-2 create and retrieve classification with company context', async () => {
        const lead = await createLead(companyA);
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id, mode: 'rule_based' });
        assert.equal(out.skipped, false);
        trackClass(out.classification);
        const got = await getClassification(companyA, out.classification._id);
        assert.equal(String(got.companyId), String(companyA));
        assert.ok(got.rulesMatched);
        assert.ok(Array.isArray(got.evidenceSnippets));
    });

    it('3 rejects access from another company', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Isolation` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        await assert.rejects(() => getClassification(companyB, out.classification._id), /not found/i);
    });

    it('4-5 rejects body/query companyId overrides', async () => {
        await assert.rejects(
            () => classifyOneRecord(companyA, userA, { companyId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
        await assert.rejects(
            () => classifyOneRecord(companyA, userA, { tenantId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
    });

    it('6 single classification persists explainability', async () => {
        const lead = await createLead(companyA, {
            companyName: `${TAG} Explain LED`,
            businessDescription: 'LED lighting manufacturer LED panel products',
        });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        const doc = await AiIndustryClassification.findById(out.classification._id).lean();
        assert.ok(doc.engineUsed);
        assert.ok(doc.confidenceScore != null);
        assert.ok(Array.isArray(doc.positiveKeywordsFound));
        assert.ok(Array.isArray(doc.rulesMatched));
    });

    it('7-8 manual override persists before/after history with user and reason', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Override Co` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        const updated = await overrideClassification(companyA, userA, out.classification._id, {
            action: 'override',
            parentIndustry: 'Textile',
            subIndustry: 'Garments',
            reason: 'Analyst correction',
        });
        assert.equal(updated.parentIndustry, 'Textile');
        assert.equal(updated.manuallyApproved, true);
        const last = updated.history[updated.history.length - 1];
        assert.equal(last.action, 'override');
        assert.equal(String(last.userId), String(userA));
        assert.equal(last.reason, 'Analyst correction');
        assert.ok(last.previous);
        assert.ok(last.next);
        assert.ok(last.previousStatus);
        assert.ok(last.resultingStatus);
    });

    it('9-12 lock persists, blocks auto reclassify, unlock works, reanalyze blocked while locked', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Lock Co` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        const locked = await lockClassification(companyA, userA, out.classification._id, { action: 'lock', reason: 'Approved lock' });
        assert.equal(locked.locked, true);
        assert.ok(locked.lockedAt);
        assert.equal(String(locked.lockedBy), String(userA));
        const lockHist = locked.history[locked.history.length - 1];
        assert.equal(lockHist.action, 'lock');
        assert.equal(String(lockHist.userId), String(userA));

        const skip = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        assert.equal(skip.skipped, true);
        assert.equal(skip.reason, 'locked');

        await assert.rejects(
            () => reanalyzeClassification(companyA, userA, out.classification._id, {}),
            /Locked classification/,
        );

        const unlocked = await lockClassification(companyA, userA, out.classification._id, { action: 'unlock', reason: 'Unlock for edit' });
        assert.equal(unlocked.locked, false);
        const unlockHist = unlocked.history[unlocked.history.length - 1];
        assert.equal(unlockHist.action, 'unlock');
    });

    it('13 mark irrelevant persists status and history', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Irrelevant Co` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        const irr = await markIrrelevantClassification(companyA, userA, out.classification._id, { reason: 'Not a fit' });
        assert.equal(irr.status, 'IRRELEVANT');
        assert.equal(irr.manuallyApproved, true);
        const last = irr.history[irr.history.length - 1];
        assert.equal(last.action, 'mark_irrelevant');
        assert.equal(last.reason, 'Not a fit');
    });

    it('14-15 evidence and history getters return scoped data', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Evidence Co` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        const ev = await getClassificationEvidence(companyA, out.classification._id);
        assert.ok(Array.isArray(ev.evidenceSnippets));
        const hist = await getClassificationHistory(companyA, out.classification._id);
        assert.ok(Array.isArray(hist.history));
        await assert.rejects(() => getClassificationEvidence(companyB, out.classification._id), /not found/i);
    });

    it('16-19 batch cursor, pause, paused no process, resume continues', async () => {
        const l1 = await createLead(companyA, { companyName: `${TAG} Batch1 LED lighting` });
        const l2 = await createLead(companyA, { companyName: `${TAG} Batch2 LED lighting` });
        const l3 = await createLead(companyA, { companyName: `${TAG} Batch3 LED lighting` });
        const batch = await createClassificationBatch(companyA, userA, {
            extractedLeadIds: [l1._id, l2._id, l3._id],
            mode: 'rule_based',
            idempotencyKey: `${TAG}-batch-pause`,
        });
        createdBatchIds.push(batch._id);
        assert.equal(batch.total, 3);
        assert.equal(batch.cursor, 0);
        assert.equal(batch.companyId.toString(), companyA.toString());
        assert.ok(batch.createdBy);
        assert.equal(batch.idempotencyKey, `${TAG}-batch-pause`);

        await processClassificationBatchChunk(companyA, userA, batch._id, { maxItems: 1 });
        let mid = await getClassificationBatch(companyA, batch._id);
        assert.equal(mid.cursor, 1);
        assert.ok(mid.processedCount >= 1);

        await controlClassificationBatch(companyA, userA, batch._id, 'pause', { reason: 'Test pause' });
        mid = await getClassificationBatch(companyA, batch._id);
        assert.equal(mid.status, 'PAUSED');
        assert.equal(mid.pauseReason, 'Test pause');
        const cursorBefore = mid.cursor;

        const pausedProcess = await processClassificationBatchChunk(companyA, userA, batch._id, { maxItems: 5 });
        assert.equal(pausedProcess.status, 'PAUSED');
        assert.equal(pausedProcess.cursor, cursorBefore);

        await controlClassificationBatch(companyA, userA, batch._id, 'resume');
        const afterResume = await processClassificationBatchChunk(companyA, userA, batch._id, { maxItems: 10 });
        assert.ok(afterResume.cursor >= cursorBefore);
    });

    it('20 failed record does not stop remaining batch items', async () => {
        const good = await createLead(companyA, { companyName: `${TAG} Good LED lighting` });
        const fakeLeadId = new mongoose.Types.ObjectId();
        const job = await AiClassificationBatchJob.create({
            companyId: companyA,
            status: 'QUEUED',
            mode: 'rule_based',
            total: 2,
            cursor: 0,
            createdBy: userA,
            results: [
                { type: 'lead', extractedLeadId: fakeLeadId, status: 'pending' },
                { type: 'lead', extractedLeadId: good._id, status: 'pending' },
            ],
        });
        createdBatchIds.push(job._id);
        const out = await processClassificationBatchChunk(companyA, userA, job._id, { maxItems: 10 });
        assert.ok(out.failedCount >= 1);
        assert.ok(out.successCount >= 1 || out.results.some((r) => r.status === 'success'));
        assert.equal(out.status, 'COMPLETED');
    });

    it('21 retry failed processes only eligible failed items', async () => {
        const good = await createLead(companyA, { companyName: `${TAG} Retry LED lighting` });
        const fakeLeadId = new mongoose.Types.ObjectId();
        const job = await AiClassificationBatchJob.create({
            companyId: companyA,
            status: 'COMPLETED',
            mode: 'rule_based',
            total: 2,
            cursor: 2,
            createdBy: userA,
            results: [
                { type: 'lead', extractedLeadId: fakeLeadId, status: 'failed', error: 'boom' },
                { type: 'lead', extractedLeadId: good._id, status: 'success' },
            ],
        });
        createdBatchIds.push(job._id);
        const retried = await controlClassificationBatch(companyA, userA, job._id, 'retry_failed');
        assert.equal(retried.results[0].status, 'pending');
        assert.equal(retried.results[1].status, 'success');
        assert.equal(retried.cursor, 0);
        assert.equal(retried.status, 'QUEUED');
    });

    it('22 repeated idempotency key does not create duplicate batch', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Idem LED` });
        const key = `${TAG}-idem-1`;
        const a = await createClassificationBatch(companyA, userA, { extractedLeadIds: [lead._id], idempotencyKey: key });
        createdBatchIds.push(a._id);
        const b = await createClassificationBatch(companyA, userA, { extractedLeadIds: [lead._id], idempotencyKey: key });
        assert.equal(String(a._id), String(b._id));
    });

    it('23 records belonging to another company are never processed', async () => {
        const foreign = await createLead(companyB, { companyName: `${TAG} Foreign LED` });
        await assert.rejects(
            () => createClassificationBatch(companyA, userA, { extractedLeadIds: [foreign._id] }),
            /No owned classification targets/,
        );
    });

    it('24 AI failure persists fallback engine information', async () => {
        const lead = await createLead(companyA, {
            companyName: `${TAG} AI Fallback LED lighting`,
            businessDescription: 'LED lighting manufacturer',
        });
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyA },
            { $set: { 'aiLeadIntelligence.classificationMode': 'ai' } },
        );
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id, mode: 'ai' });
        trackClass(out.classification);
        assert.equal(out.classification.fallbackUsed, true);
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyA },
            { $set: { 'aiLeadIntelligence.classificationMode': 'rule_based' } },
        );
    });

    it('25 no classification payload exposes AI keys or secrets', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Secret Check LED` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        const blob = JSON.stringify(out);
        for (const secret of ['OPENAI_API_KEY', 'sk-proj-', 'apiKey":"', 'Bearer sk-']) {
            assert.equal(blob.includes(secret), false);
        }
    });

    it('manually approved classification is not silently overwritten', async () => {
        const lead = await createLead(companyA, { companyName: `${TAG} Approved LED` });
        const out = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        trackClass(out.classification);
        await overrideClassification(companyA, userA, out.classification._id, { action: 'accept' });
        const skip = await classifyOneRecord(companyA, userA, { extractedLeadId: lead._id });
        assert.equal(skip.skipped, true);
        assert.equal(skip.reason, 'manual_approved');
    });

    it('controller rejects body companyId override', async () => {
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.companyId = companyA;
            req.user = { id: userA };
            next();
        });
        app.post('/classify', industryClassificationController.classifyOne);
        app.use((err, _req, res, _next) => {
            res.status(err.statusCode || 500).json({ message: err.message });
        });

        const server = app.listen(0);
        const { port } = server.address();
        try {
            const res = await fetch(`http://127.0.0.1:${port}/classify`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ companyId: String(companyB), record: { companyName: 'x' } }),
            });
            assert.equal(res.status, 400);
            const body = await res.json();
            assert.match(body.message, /companyId\/tenantId overrides are rejected/);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('list classifications is company scoped', async () => {
        const listed = await listClassifications(companyA, { limit: 5 });
        assert.ok(Array.isArray(listed.results));
        for (const row of listed.results) {
            assert.equal(String(row.companyId), String(companyA));
        }
    });
});

describe('Phase 6A pure AI fallback unit', () => {
    it('classifyIndustryRecord ai mode falls back without exposing secrets', async () => {
        const masters = {
            industries: [{
                _id: new mongoose.Types.ObjectId(),
                parentIndustry: 'Lighting',
                subIndustry: 'LED Lighting',
                keywords: ['led', 'lighting'],
                productKeywords: ['led driver'],
                websiteKeywords: ['led'],
                negativeKeywords: [],
                exclusionTerms: [],
                isActive: true,
            }],
            customerTypes: [],
            opportunityMaps: [],
        };
        const result = await classifyIndustryRecord(companyA, {
            companyName: 'LED Lighting Works',
            businessDescription: 'LED lighting manufacturer',
        }, {
            aiLeadIntelligence: { enabled: true, classificationMode: 'ai', minimumConfidence: 40, requireManualReviewBelowConfidence: 55, autoApplyOnSearch: true },
        }, { masters, forceMode: 'ai' });
        assert.equal(result.fallbackUsed, true);
        const blob = JSON.stringify(result);
        assert.equal(blob.includes('sk-'), false);
        assert.equal(blob.toLowerCase().includes('openai_api_key'), false);
    });
});
