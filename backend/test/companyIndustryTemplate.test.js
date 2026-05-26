import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION_STAGES } from '../src/models/workOrder.model.js';
import {
    resolveProductionStages,
    mergeIndustryConfig,
} from '../src/services/productionTemplate.service.js';
import { isJskUrjaCompany } from '../src/services/companyIndustryBootstrap.service.js';
import { DEFAULT_JSK_INDUSTRY_CONFIG } from '../src/constants/industryTemplates.defaults.js';

describe('JSK industry defaults', () => {
    it('default config matches prompt mapping', () => {
        assert.equal(DEFAULT_JSK_INDUSTRY_CONFIG.companyDisplayName, 'JSK URJA');
        assert.equal(DEFAULT_JSK_INDUSTRY_CONFIG.industryTemplate, 'Electronics Manufacturer');
        assert.equal(DEFAULT_JSK_INDUSTRY_CONFIG.productionProcessTemplate, 'JSK Electronics Standard Process');
        assert.equal(DEFAULT_JSK_INDUSTRY_CONFIG.behaviorMode, 'legacy-compatible');
    });

    it('detects JSK default company by isDefault flag', () => {
        assert.equal(isJskUrjaCompany({ isDefault: true, companyName: 'Any' }), true);
    });

    it('detects JSK by name', () => {
        assert.equal(isJskUrjaCompany({ companyName: 'JSK INNOVATIVE TECH PVT LTD' }), true);
    });
});

describe('resolveProductionStages — legacy safety', () => {
    it('legacy-compatible returns exact PRODUCTION_STAGES (9 stages)', () => {
        const stages = resolveProductionStages(DEFAULT_JSK_INDUSTRY_CONFIG);
        assert.equal(stages.length, PRODUCTION_STAGES.length);
        assert.deepEqual(
            stages.map((s) => s.stageName),
            PRODUCTION_STAGES.map((s) => s.stageName),
        );
    });

    it('unknown template falls back to PRODUCTION_STAGES', () => {
        const stages = resolveProductionStages({
            behaviorMode: 'template-driven',
            industryTemplate: 'Unknown',
            productionProcessTemplate: 'Unknown',
        });
        assert.equal(stages.length, PRODUCTION_STAGES.length);
    });

    it('mergeIndustryConfig fills JSK defaults when empty', () => {
        const m = mergeIndustryConfig({});
        assert.equal(m.behaviorMode, 'legacy-compatible');
        assert.equal(m.industryTemplate, 'Electronics Manufacturer');
    });
});
