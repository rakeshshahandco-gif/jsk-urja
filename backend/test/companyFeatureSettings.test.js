import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    mergeFeatureSettings,
    isFeatureEnabled,
    shouldDeductStockOnSales,
    shouldPostSalesLedger,
    featureForApiPath,
} from '../src/services/companyFeatureSettings.service.js';

describe('companyFeatureSettings — merge and defaults', () => {
    it('defaults all features to enabled when empty', () => {
        const s = mergeFeatureSettings(null);
        assert.equal(isFeatureEnabled(s, 'gst.eInvoiceRequired'), true);
        assert.equal(isFeatureEnabled(s, 'inventory.inventoryRequired'), true);
    });

    it('merges partial patch without dropping other sections', () => {
        const s = mergeFeatureSettings({ gst: { eInvoiceRequired: false } });
        assert.equal(isFeatureEnabled(s, 'gst.eInvoiceRequired'), false);
        assert.equal(isFeatureEnabled(s, 'gst.eWayBillRequired'), true);
    });
});

describe('companyFeatureSettings — company isolation logic', () => {
    it('company A disabled flag does not affect company B settings object', () => {
        const companyA = mergeFeatureSettings({ gst: { gstApplicable: false } });
        const companyB = mergeFeatureSettings({ gst: { gstApplicable: true } });
        assert.equal(isFeatureEnabled(companyA, 'gst.gstApplicable'), false);
        assert.equal(isFeatureEnabled(companyB, 'gst.gstApplicable'), true);
    });
});

describe('companyFeatureSettings — inventory on/off', () => {
    it('skips stock deduction when inventory off', () => {
        const s = mergeFeatureSettings({
            inventory: { inventoryRequired: false, stockDeductionOnSales: true },
        });
        assert.equal(shouldDeductStockOnSales(s), false);
    });

    it('skips stock deduction when stock flag off', () => {
        const s = mergeFeatureSettings({
            inventory: { inventoryRequired: true, stockDeductionOnSales: false },
        });
        assert.equal(shouldDeductStockOnSales(s), false);
    });

    it('deducts stock when both flags on', () => {
        const s = mergeFeatureSettings(null);
        assert.equal(shouldDeductStockOnSales(s), true);
    });
});

describe('companyFeatureSettings — GST flags', () => {
    it('maps API paths to feature keys', () => {
        assert.equal(featureForApiPath('/e-invoices'), 'gst.eInvoiceRequired');
        assert.equal(featureForApiPath('/eway-bills/abc'), 'gst.eWayBillRequired');
        assert.equal(featureForApiPath('/gst-reports/gstr1'), 'gst.gstApplicable');
    });

    it('unknown paths are not gated', () => {
        assert.equal(featureForApiPath('/sales/invoices'), null);
    });
});

describe('platformFeatureSettings — merge order', () => {
    it('platform override applies when company has no value', () => {
        const platform = { gst: { eInvoiceRequired: false } };
        const s = mergeFeatureSettings({}, platform);
        assert.equal(isFeatureEnabled(s, 'gst.eInvoiceRequired'), false);
    });

    it('company override wins over platform', () => {
        const platform = { gst: { eInvoiceRequired: false } };
        const company = { gst: { eInvoiceRequired: true } };
        const s = mergeFeatureSettings(company, platform);
        assert.equal(isFeatureEnabled(s, 'gst.eInvoiceRequired'), true);
    });
});

describe('companyFeatureSettings — accounting posting', () => {
    it('respects accounting toggles', () => {
        const off = mergeFeatureSettings({
            accounting: { accountingRequired: false, autoLedgerPosting: true },
        });
        assert.equal(shouldPostSalesLedger(off), false);

        const on = mergeFeatureSettings(null);
        assert.equal(shouldPostSalesLedger(on), true);
    });
});
