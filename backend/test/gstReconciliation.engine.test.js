import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeInvoiceRef,
    getMonthDateRange,
    scoreGstPair,
    classifyGstMatchStatus,
    isRcmRecord,
    DEFAULT_GST_MATCH_CONFIG,
} from '../src/services/gstReconciliation/gstReconEngine.js';

describe('gstReconEngine', () => {
    it('normalizes invoice numbers', () => {
        assert.equal(normalizeInvoiceRef('INV-01/A'), normalizeInvoiceRef('inv01a'));
    });

    it('FY month range for April', () => {
        const { startDate, endDate } = getMonthDateRange('2025-2026', '04');
        assert.equal(startDate.getMonth(), 3);
        assert.equal(startDate.getFullYear(), 2025);
        assert.equal(endDate.getDate(), 30);
    });

    it('FY month range for January', () => {
        const { startDate } = getMonthDateRange('2025-2026', '01');
        assert.equal(startDate.getFullYear(), 2026);
    });

    it('scores exact GST match', () => {
        const books = {
            supplierGstin: '27AAAAA0000A1Z5',
            supplierInvoiceNo: 'PI-100',
            invoiceDate: new Date('2025-04-10'),
            totalTaxableAmount: 10000,
            totalTax: 1800,
        };
        const portal = {
            supplierGstin: '27AAAAA0000A1Z5',
            invoiceNumber: 'PI100',
            invoiceDate: new Date('2025-04-10'),
            taxableValue: 10000,
            totalTax: 1800,
        };
        const { score } = scoreGstPair(books, portal, DEFAULT_GST_MATCH_CONFIG);
        assert.ok(score >= 90);
    });

    it('classifies books only', () => {
        assert.equal(classifyGstMatchStatus({ supplierGstin: 'x' }, null), 'Books Only');
    });

    it('detects RCM flag', () => {
        assert.ok(isRcmRecord({ reverseCharge: true }));
        assert.ok(isRcmRecord({ isReverseCharge: true }));
    });
});
