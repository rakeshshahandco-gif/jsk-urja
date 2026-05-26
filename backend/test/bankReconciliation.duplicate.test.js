import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileContentHash, lineFingerprint } from '../src/services/bankReconciliation/duplicateDetection.js';

describe('duplicateDetection', () => {
    it('fileContentHash is stable', () => {
        const h1 = fileContentHash(Buffer.from('same content'));
        const h2 = fileContentHash(Buffer.from('same content'));
        const h3 = fileContentHash(Buffer.from('other'));
        assert.equal(h1, h2);
        assert.notEqual(h1, h3);
    });

    it('lineFingerprint matches same transaction', () => {
        const d = new Date('2026-05-01');
        const a = lineFingerprint({
            cashBankAccountId: 'bank1',
            txnDate: d,
            amount: 1000,
            drCr: 'Deposit',
            narration: 'NEFT ABC',
            utrRef: 'UTR1',
            chequeNo: '',
        });
        const b = lineFingerprint({
            cashBankAccountId: 'bank1',
            txnDate: d,
            amount: 1000,
            drCr: 'Deposit',
            narration: 'NEFT ABC',
            utrRef: 'UTR1',
            chequeNo: '',
        });
        assert.equal(a, b);
    });
});
