import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    mergeFeatureSettings,
    isFeatureEnabled,
    deepMerge,
} from '../src/services/companyFeatureSettings.service.js';

describe('platformFeatureSettings — merge order', () => {
    it('platform override applies when company has no value', () => {
        const platform = { gst: { eInvoiceRequired: false } };
        const s = mergeFeatureSettings({}, platform);
        assert.equal(isFeatureEnabled(s, 'gst.eInvoiceRequired'), false);
        assert.equal(isFeatureEnabled(s, 'gst.eWayBillRequired'), true);
    });

    it('company override wins over platform', () => {
        const platform = { gst: { eInvoiceRequired: false } };
        const company = { gst: { eInvoiceRequired: true } };
        const s = mergeFeatureSettings(company, platform);
        assert.equal(isFeatureEnabled(s, 'gst.eInvoiceRequired'), true);
    });

    it('deepMerge chains three layers', () => {
        const merged = deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3 } }, { a: { z: 4 } });
        assert.deepEqual(merged, { a: { x: 1, y: 3, z: 4 } });
    });
});
