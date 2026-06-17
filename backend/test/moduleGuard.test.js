import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveModules } from '../src/services/moduleGuard.service.js';
import { ALL_MODULE_CODES } from '../src/constants/moduleRegistry.constants.js';

describe('moduleGuard.service', () => {
    it('preserves JSK legacy behavior when module allocation not configured', () => {
        const company = {
            companyName: 'JSK Innovative Technology',
            isDefault: true,
            enabledModules: ['crm', 'sales'],
            moduleGuardEnabled: false,
            moduleAllocationConfigured: false,
        };
        const template = { templateCode: 'ELECTRONICS_JSK', templateSettings: {} };
        const result = resolveEffectiveModules(company, template);
        assert.equal(result.moduleGuardEnabled, false);
        assert.deepEqual(result.enabledModules, ALL_MODULE_CODES);
    });

    it('enforces textile modules when allocation is configured', () => {
        const company = {
            companyName: 'Handloom Group',
            moduleGuardEnabled: true,
            moduleAllocationConfigured: true,
            enabledModules: ['sales', 'textile_job_work', 'inventory', 'gst', 'reports', 'admin'],
            disabledModules: [],
        };
        const template = {
            templateCode: 'TEXTILE',
            templateSettings: { moduleSettings: { enforceModuleGuard: true } },
        };
        const result = resolveEffectiveModules(company, template);
        assert.equal(result.moduleGuardEnabled, true);
        assert.ok(result.enabledModules.includes('textile_job_work'));
        assert.ok(!result.enabledModules.includes('pcb'));
        assert.ok(!result.enabledModules.includes('bom'));
    });

    it('respects disabledModules list', () => {
        const company = {
            companyName: 'Test Co',
            moduleGuardEnabled: true,
            moduleAllocationConfigured: true,
            enabledModules: ['sales', 'purchase', 'inventory'],
            disabledModules: ['purchase'],
        };
        const result = resolveEffectiveModules(company, { templateCode: 'TRADING', templateSettings: {} });
        assert.ok(result.enabledModules.includes('sales'));
        assert.ok(!result.enabledModules.includes('purchase'));
    });
});