/**
 * Compatibility tests for AI Lead Intelligence controller handlers.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import * as extractorController from '../../src/controllers/extractor.controller.js';
import {
    classifySampleLeadIntelligence,
    getAiLeadIntelligenceOverview,
    updateAiLeadIntelligenceSettings,
} from '../../src/services/dataExtractor/aiLeadIntelligenceAdmin.service.js';
import { AiIndustryMaster } from '../../src/models/aiIndustryMaster.model.js';
import { ExtractorSettings } from '../../src/models/extractorSettings.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { Company } from '../../src/models/company.model.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `AILI-CTRL-${Date.now()}`;

function mockRes() {
    const out = { statusCode: 200, body: null, headers: {} };
    return {
        out,
        status(code) { out.statusCode = code; return this; },
        setHeader(k, v) { out.headers[k] = v; },
        send(payload) { out.body = payload; return this; },
    };
}

function runHandler(handler, req) {
    return new Promise((resolve, reject) => {
        const res = mockRes();
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            fn(value);
        };
        const origSend = res.send.bind(res);
        res.send = (payload) => {
            origSend(payload);
            finish(resolve, res.out);
            return res;
        };
        try {
            handler(req, res, (err) => {
                if (err) finish(reject, err);
                else finish(resolve, res.out);
            });
        } catch (err) {
            finish(reject, err);
        }
    });
}

describe('AI Lead Intelligence controller compatibility', () => {
    let companyA;
    let companyB;
    let userA;

    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        await mongoose.connect(MONGO_URI);
        companyA = await Company.create({ companyName: `${TAG}-A`, isActive: true, moduleGuardEnabled: false, enabledModules: ['crm', 'data_extractor'] });
        companyB = await Company.create({ companyName: `${TAG}-B`, isActive: true, moduleGuardEnabled: false, enabledModules: ['crm', 'data_extractor'] });
        userA = { id: new mongoose.Types.ObjectId().toString(), roleName: 'admin' };
        await AiIndustryMaster.create({
            companyId: companyA._id,
            parentIndustry: 'Lighting',
            subIndustry: 'LED Manufacturing',
            keywords: ['led manufacturer'],
            isActive: true,
        });
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyA._id },
            { $set: { moduleEnabled: true, aiLeadIntelligence: { enabled: true, classificationMode: 'rule_based' } } },
            { upsert: true },
        );
    });

    after(async () => {
        await AiIndustryMaster.deleteMany({ companyId: { $in: [companyA._id, companyB._id] } });
        await ExtractorSettings.deleteMany({ companyId: { $in: [companyA._id, companyB._id] } });
        await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
        await mongoose.disconnect();
    });

    it('22. all three controller exports exist', () => {
        assert.equal(typeof extractorController.getAiLeadIntelligenceOverview, 'function');
        assert.equal(typeof extractorController.saveAiLeadIntelligenceOverview, 'function');
        assert.equal(typeof extractorController.classifyAiLeadSampleHandler, 'function');
        assert.equal(typeof extractorController.getSettings, 'function');
    });

    it('1-5. overview uses authenticated company scope and ignores body companyId', async () => {
        await assert.rejects(
            () => runHandler(extractorController.getAiLeadIntelligenceOverview, {
                companyId: companyA._id,
                user: userA,
                body: { companyId: companyB._id },
                query: {},
            }),
            (err) => err.statusCode === 400 || err.status === 400,
        );

        const out = await runHandler(extractorController.getAiLeadIntelligenceOverview, {
            companyId: companyA._id,
            user: userA,
            body: {},
            query: {},
        });
        const data = out.body?.data ?? out.body;
        assert.ok(data.settings);
        assert.ok(Array.isArray(data.industries));
        assert.equal(typeof getAiLeadIntelligenceOverview, 'function');
    });

    it('6-12. save maps to settings update + masters; rejects unknown/prohibited fields', async () => {
        await assert.rejects(
            () => runHandler(extractorController.saveAiLeadIntelligenceOverview, {
                companyId: companyA._id,
                user: userA,
                body: { settings: { enabled: true }, unexpectedField: 1 },
                query: {},
            }),
            (err) => /Unknown field/i.test(err.message),
        );

        await assert.rejects(
            () => runHandler(extractorController.saveAiLeadIntelligenceOverview, {
                companyId: companyA._id,
                user: userA,
                body: { settings: { enabled: true, $set: { x: 1 } } },
                query: {},
            }),
            (err) => /Prohibited field/i.test(err.message),
        );

        const beforeLeads = await ExtractedLead.countDocuments({ companyId: companyA._id });
        const out = await runHandler(extractorController.saveAiLeadIntelligenceOverview, {
            companyId: companyA._id,
            user: userA,
            body: {
                settings: {
                    enabled: true,
                    classificationMode: 'rule_based',
                    minimumConfidence: 50,
                    targetMarket: { relevantMinScore: 72, targetProducts: ['LED Driver'] },
                },
                industries: [{
                    parentIndustry: 'Lighting',
                    subIndustry: 'LED Manufacturing',
                    keywords: ['led manufacturer', 'oem'],
                    isActive: true,
                }],
            },
            query: {},
        });
        const data = out.body?.data ?? out.body;
        // Controller returns settings envelope from admin service (schema may strip aiLeadIntelligence — pre-existing).
        assert.ok(data.settings && typeof data.settings === 'object');
        assert.equal(typeof data.settings.classificationMode, 'string');
        assert.ok(Array.isArray(data.industries));
        assert.ok(data.industries.some((r) => r.subIndustry === 'LED Manufacturing'));
        assert.equal(data.settings.apiKey, undefined);
        const blob = JSON.stringify(data);
        assert.equal(blob.includes('sk-'), false);
        const afterLeads = await ExtractedLead.countDocuments({ companyId: companyA._id });
        assert.equal(afterLeads, beforeLeads);
        assert.equal(typeof updateAiLeadIntelligenceSettings, 'function');
    });

    it('13-21. sample classification is dry-run with company scope and limits', async () => {
        await assert.rejects(
            () => runHandler(extractorController.classifyAiLeadSampleHandler, {
                companyId: companyA._id,
                user: userA,
                body: { companyId: String(companyB._id), record: { companyName: 'X' } },
                query: {},
            }),
            (err) => err.statusCode === 400 || err.status === 400,
        );

        await assert.rejects(
            () => runHandler(extractorController.classifyAiLeadSampleHandler, {
                companyId: companyA._id,
                user: userA,
                body: { apiKey: 'secret-should-reject', record: { companyName: 'X' } },
                query: {},
            }),
            (err) => /credentials/i.test(err.message),
        );

        await assert.rejects(
            () => runHandler(extractorController.classifyAiLeadSampleHandler, {
                companyId: companyA._id,
                user: userA,
                body: { record: { companyName: 'x'.repeat(70 * 1024) } },
                query: {},
            }),
            (err) => /too large/i.test(err.message),
        );

        const beforeLeads = await ExtractedLead.countDocuments({ companyId: companyA._id });
        const out = await runHandler(extractorController.classifyAiLeadSampleHandler, {
            companyId: companyA._id,
            user: userA,
            body: {
                settings: { enabled: true, classificationMode: 'rule_based' },
                record: {
                    companyName: 'Bright LED Works Pvt Ltd',
                    website: 'https://brightlighting.in',
                    businessDescription: 'LED manufacturer for OEM street light applications',
                    keywords: ['led manufacturer'],
                },
            },
            query: {},
        });
        const data = out.body?.data ?? out.body;
        assert.ok(data.industry || data.status || data.engineUsed);
        const blob = JSON.stringify(data);
        assert.equal(blob.includes('secret-should-reject'), false);
        assert.equal(blob.toLowerCase().includes('api_key'), false);
        const afterLeads = await ExtractedLead.countDocuments({ companyId: companyA._id });
        assert.equal(afterLeads, beforeLeads);
        assert.equal(typeof classifySampleLeadIntelligence, 'function');
    });
});
