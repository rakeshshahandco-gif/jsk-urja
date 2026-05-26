import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isBillWiseLedger,
    getAgeingBucket,
    computeOverdueDays,
    SETTLEMENT_REF_TYPES,
} from '../src/services/accounting/billWiseSettlement.service.js';
import { summarizeAgeing } from '../src/services/billWiseAdjustment.service.js';

describe('billWiseSettlement', () => {
    it('detects bill-wise ledgers', () => {
        assert.equal(isBillWiseLedger({ type: 'Customer', isCustomer: true }), true);
        assert.equal(isBillWiseLedger({ type: 'General', isBillWise: true }), true);
        assert.equal(isBillWiseLedger({ type: 'General', groupName: 'Sundry Creditors' }), true);
        assert.equal(isBillWiseLedger({ type: 'General', groupName: 'Cash in Hand' }), false);
    });

    it('maps ageing buckets', () => {
        assert.equal(getAgeingBucket(15), '0-30');
        assert.equal(getAgeingBucket(45), '31-60');
        assert.equal(getAgeingBucket(200), '180+');
    });

    it('computes overdue days from due date', () => {
        const past = new Date();
        past.setDate(past.getDate() - 10);
        assert.equal(computeOverdueDays(past, 100), 10);
        assert.equal(computeOverdueDays(past, 0), 0);
    });

    it('supports settlement reference types', () => {
        assert.ok(SETTLEMENT_REF_TYPES.includes('Against Bill'));
        assert.ok(SETTLEMENT_REF_TYPES.includes('On Account'));
        assert.ok(SETTLEMENT_REF_TYPES.includes('Advance'));
    });

    it('summarizes ageing totals', () => {
        const buckets = summarizeAgeing([
            { pendingAmount: 1000, ageingBucket: '0-30' },
            { pendingAmount: 500, ageingBucket: '31-60' },
        ]);
        assert.equal(buckets['0-30'], 1000);
        assert.equal(buckets['31-60'], 500);
    });
});
