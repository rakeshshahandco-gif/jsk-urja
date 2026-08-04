import assert from 'assert';
import {
    settlementAmountFromAdjustment,
    buildReceiptPaymentBalanceLines,
} from '../src/services/accounting/billAdjustmentDiscount.service.js';
import { assertBalancedEntries } from '../src/services/accounting/accountingValidation.service.js';

describe('Phase 1 bill-adjustment discount GL contracts', () => {
    it('settlement amount = bank + discount + round-off', () => {
        assert.strictEqual(
            settlementAmountFromAdjustment({ amount: 300, discountAmount: 36, roundOff: 0 }),
            336,
        );
        assert.strictEqual(
            settlementAmountFromAdjustment({ amount: 9995, discountAmount: 5 }),
            10000,
        );
        assert.strictEqual(settlementAmountFromAdjustment({ amount: 100 }), 100);
    });

    it('Receipt bank 300 + discount 36 + customer 336 balances', () => {
        const lines = buildReceiptPaymentBalanceLines({
            nature: 'Receipt',
            bankAmount: 300,
            items: [
                { ledgerId: 'cust', amount: 336, type: 'Credit' },
                {
                    ledgerId: 'disc',
                    amount: 36,
                    type: 'Debit',
                    lineRole: 'BillAdjustmentDiscount',
                },
            ],
        });
        assertBalancedEntries(lines, 'Receipt sample');
    });

    it('Payment bank 9995 + discount 5 + supplier 10000 balances', () => {
        const lines = buildReceiptPaymentBalanceLines({
            nature: 'Payment',
            bankAmount: 9995,
            items: [
                { ledgerId: 'sup', amount: 10000, type: 'Debit' },
                {
                    ledgerId: 'disc',
                    amount: 5,
                    type: 'Credit',
                    lineRole: 'BillAdjustmentDiscount',
                },
            ],
        });
        assertBalancedEntries(lines, 'Payment sample');
    });

    it('unbalanced Receipt is rejected', () => {
        const lines = buildReceiptPaymentBalanceLines({
            nature: 'Receipt',
            bankAmount: 300,
            items: [{ ledgerId: 'cust', amount: 300, type: 'Credit' }],
        });
        // bank 300 Dr + cust 300 Cr is balanced without discount — OK
        assertBalancedEntries(lines, 'bank only');

        let threw = false;
        try {
            assertBalancedEntries(
                buildReceiptPaymentBalanceLines({
                    nature: 'Receipt',
                    bankAmount: 300,
                    items: [{ ledgerId: 'cust', amount: 336, type: 'Credit' }],
                }),
                'missing discount',
            );
        } catch {
            threw = true;
        }
        assert.strictEqual(threw, true);
    });
});
