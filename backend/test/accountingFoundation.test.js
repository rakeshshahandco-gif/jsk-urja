import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    sumDebitCredit,
    assertBalancedEntries,
    assertGstMatchesVoucher,
} from '../src/services/accounting/accountingValidation.service.js';
import { ApiError } from '../src/utils/ApiError.js';

describe('accounting foundation validation', () => {
    it('sums debit and credit', () => {
        const { debitTotal, creditTotal } = sumDebitCredit([
            { amount: 100, type: 'Debit' },
            { amount: 100, type: 'Credit' },
        ]);
        assert.equal(debitTotal, 100);
        assert.equal(creditTotal, 100);
    });

    it('allows balanced journal lines', () => {
        assert.doesNotThrow(() => assertBalancedEntries([
            { amount: 500, type: 'Debit' },
            { amount: 500, type: 'Credit' },
        ]));
    });

    it('blocks unbalanced journal lines', () => {
        assert.throws(
            () => assertBalancedEntries([
                { amount: 500, type: 'Debit' },
                { amount: 400, type: 'Credit' },
            ]),
            (err) => err instanceof ApiError,
        );
    });

    it('validates GST header vs lines', () => {
        assert.doesNotThrow(() => assertGstMatchesVoucher({
            isGstEnabled: true,
            totalTaxableAmount: 1000,
            totalCgst: 90,
            totalSgst: 90,
            totalIgst: 0,
            totalTax: 180,
            roundOff: 0,
            grandTotal: 1180,
            items: [{ cgstAmount: 90, sgstAmount: 90, igstAmount: 0 }],
        }));
    });
});
