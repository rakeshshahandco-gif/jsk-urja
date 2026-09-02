import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    entityIdOf,
    ledgerNameExactOrLooseRegex,
    normalizeLedgerLookupName,
    isValidGstinForLedgerMatch,
    isUsableCustomerLedger,
    pickUniqueCustomerLedger,
} from '../src/utils/ledgerDispatcher.js';

describe('sales invoice customer ledger lookup (read-only)', () => {
    it('matches ledger name when SO snapshot has extra spaces', () => {
        const re = ledgerNameExactOrLooseRegex('PARTH LIGHT HOUSE  NX');
        assert.ok(re.test('PARTH LIGHT HOUSE NX'));
        assert.ok(re.test('  PARTH LIGHT HOUSE  NX  '));
        assert.ok(re.test('parth light house nx'));
        assert.equal(re.test('PARTH LIGHT HOUSE'), false);
    });

    it('normalizes case and collapsed spaces for name fallback', () => {
        assert.equal(normalizeLedgerLookupName('  PARTH LIGHT HOUSE  NX  '), 'PARTH LIGHT HOUSE NX');
    });

    it('reads populated customerId objects', () => {
        assert.equal(String(entityIdOf({ _id: '6a86cc4e09b8833b32443e03' })), '6a86cc4e09b8833b32443e03');
        assert.equal(entityIdOf(null), null);
    });

    it('accepts only a valid 15-char GSTIN for GSTIN matching', () => {
        assert.equal(isValidGstinForLedgerMatch('27AITPP7406L2ZG'), '27AITPP7406L2ZG');
        assert.equal(isValidGstinForLedgerMatch('  27aitpp7406l2zg  '), '27AITPP7406L2ZG');
        assert.equal(isValidGstinForLedgerMatch(''), '');
        assert.equal(isValidGstinForLedgerMatch('ABC'), '');
        assert.equal(isValidGstinForLedgerMatch('27AITPP7406L2Z'), '');
    });

    it('rejects inactive / missing ledgers', () => {
        assert.equal(isUsableCustomerLedger(null), false);
        assert.equal(isUsableCustomerLedger({ status: 'Inactive' }), false);
        assert.equal(isUsableCustomerLedger({ status: 'Active' }), true);
        assert.equal(isUsableCustomerLedger({}), true);
    });

    it('does not auto-pick when more than one ledger matches', () => {
        assert.equal(pickUniqueCustomerLedger([], 'name'), null);
        assert.equal(
            pickUniqueCustomerLedger([{ _id: 'a', status: 'Active' }], 'name')._id,
            'a'
        );
        assert.throws(
            () => pickUniqueCustomerLedger(
                [{ _id: 'a', status: 'Active' }, { _id: 'b', status: 'Active' }],
                'customer name "DUP"'
            ),
            (err) => /Ambiguous ledger match/.test(err.message) && /Admin review/.test(err.message)
        );
        assert.equal(
            pickUniqueCustomerLedger(
                [{ _id: 'dead', status: 'Inactive' }, { _id: 'live', status: 'Active' }],
                'name'
            )._id,
            'live'
        );
    });
});
