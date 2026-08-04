/**
 * Creditor GST/RCM profile helpers — no DB posting.
 * Run: node --test backend/test/rcm/rcmSupplierProfile.phase3.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RCM supplier profile enums', () => {
    it('supports Mixed / Transaction-wise property and Not Applicable GST status', async () => {
        const {
            PROPERTY_TYPES,
            SUPPLIER_GST_STATUSES,
            normalizePropertyType,
            normalizeSupplierGstStatus,
            mapTransportSupplierTypeToServiceType,
            mapTransportGstPaymentToOption,
        } = await import('../../src/config/rcmCanonicalEnums.js');

        assert.ok(PROPERTY_TYPES.includes('Mixed'));
        assert.ok(PROPERTY_TYPES.includes('Transaction-wise'));
        assert.equal(normalizePropertyType('Mixed').value, 'Mixed');
        assert.equal(normalizePropertyType('Transaction-wise').value, 'Transaction-wise');
        assert.equal(normalizePropertyType('Commercial').value, 'Commercial');
        // Must NOT silently map Mixed → Commercial
        assert.notEqual(normalizePropertyType('Mixed').value, 'Commercial');

        assert.ok(SUPPLIER_GST_STATUSES.includes('Not Applicable'));
        assert.ok(SUPPLIER_GST_STATUSES.includes('Exempt Entity'));
        assert.equal(normalizeSupplierGstStatus('Not Applicable').value, 'Not Applicable');

        assert.equal(
            mapTransportSupplierTypeToServiceType('GTA — Issues Consignment Note'),
            'GTA with consignment note',
        );
        assert.equal(mapTransportSupplierTypeToServiceType('Courier Agency'), 'Courier');
        assert.equal(
            mapTransportSupplierTypeToServiceType('Local Transporter — No Consignment Note'),
            'Local Transport',
        );
        assert.equal(
            mapTransportGstPaymentToOption('Recipient Pays under RCM'),
            'Reverse Charge',
        );
        assert.equal(
            mapTransportGstPaymentToOption('Supplier Pays under Forward Charge'),
            'Forward Charge',
        );
    });

    it('applySupplierRcmDefaults only fills empty voucher fields', async () => {
        const { applySupplierRcmDefaults } = await import('../../src/services/rcmDecisionEngine.service.js');
        const supplier = {
            gstRegistrationStatus: 'Unregistered',
            gstNumber: '',
            supplierChargesGst: 'Transaction-wise',
            defaultPropertyType: 'Commercial',
            defaultRcmCategories: ['RENT'],
            defaultPlaceOfSupply: 'Maharashtra',
            transportSupplierType: 'Courier Agency',
            consignmentNoteNormallyIssued: 'No',
            defaultRcmTreatment: 'RCM May Apply',
        };
        const out = applySupplierRcmDefaults({}, supplier);
        assert.equal(out.propertyType, 'Commercial');
        assert.equal(out.rcmCategory, 'RENT');
        assert.equal(out.transportServiceType, 'Courier');
        assert.equal(out.consignmentNoteAvailable, false);
        assert.ok(out._supplierDefaultsApplied.includes('propertyType'));

        const override = applySupplierRcmDefaults(
            { propertyType: 'Residential', rcmCategory: 'GTA', transportServiceType: 'GTA with consignment note' },
            supplier,
        );
        assert.equal(override.propertyType, 'Residential');
        assert.equal(override.rcmCategory, 'GTA');
        assert.equal(override.transportServiceType, 'GTA with consignment note');
        assert.ok(!override._supplierDefaultsApplied.includes('propertyType'));
    });

    it('does not map Not Applicable supplierChargesGst into Reverse Charge', async () => {
        const { applySupplierRcmDefaults } = await import('../../src/services/rcmDecisionEngine.service.js');
        const out = applySupplierRcmDefaults({}, {
            supplierChargesGst: 'Not Applicable',
            gstRegistrationStatus: 'Unregistered',
        });
        assert.equal(out.supplierGstOption || '', '');
    });
});

describe('RCM supplier profile safety (source)', () => {
    it('engine resolves supplier without name-only match and Mixed is Review Required', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../../src/services/rcmDecisionEngine.service.js'),
            'utf8',
        );
        assert.match(src, /resolveSupplierForRcmEvaluate/);
        assert.match(src, /Name-only matching is never used|never used/i);
        assert.match(src, /ambiguous/);
        assert.match(src, /Mixed property/);
        assert.match(src, /recipientCompany/);
        assert.match(src, /gstRegistrationStatusDerived/);
        assert.doesNotMatch(src, /supplierName:\s*input\.supplierName/);
        assert.match(src, /Blank GSTIN/);
        // Liability posting services remain separate modules
        assert.doesNotMatch(src, /postRcmLiability|recordRcmPayment|releaseRcmItc/);
    });

    it('supplier model includes additive RCM profile fields', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../../src/models/supplier.model.js'),
            'utf8',
        );
        assert.match(src, /defaultRcmTreatment/);
        assert.match(src, /defaultRcmCategories/);
        assert.match(src, /defaultPropertyType/);
        assert.match(src, /transportServiceSupplier/);
        assert.match(src, /Not Applicable/);
        assert.match(src, /Exempt Entity/);
    });
});
