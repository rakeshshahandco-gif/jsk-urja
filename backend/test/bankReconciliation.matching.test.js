import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ledgerTypeToMovement,
    textSimilarity,
    amountsMatch,
    scorePair,
    classifyScore,
    suggestMatches,
    matchPriority,
    DEFAULT_MATCH_CONFIG,
    DATE_TOLERANCE_PRESETS,
} from '../src/services/bankReconciliation/matchingEngine.js';

describe('matchingEngine', () => {
    it('default date tolerance is ±3 days', () => {
        assert.equal(DEFAULT_MATCH_CONFIG.dateToleranceDays, DATE_TOLERANCE_PRESETS.plusMinus3);
    });

    it('priority 1 for exact date and UTR', () => {
        const book = {
            movement: 'Deposit',
            amount: 500,
            date: new Date('2026-03-10'),
            narration: '',
            partyName: '',
            voucherNo: '',
            bankReference: 'UTRX',
            instrumentNo: '',
        };
        const bank = {
            drCr: 'Deposit',
            amount: 500,
            txnDate: new Date('2026-03-10'),
            narration: '',
            counterpartyName: '',
            utrRef: 'UTRX',
            chequeNo: '',
        };
        const { priority } = matchPriority(book, bank);
        assert.equal(priority, 1);
    });

    it('maps ledger Debit to Deposit', () => {
        assert.equal(ledgerTypeToMovement('Debit'), 'Deposit');
        assert.equal(ledgerTypeToMovement('Credit'), 'Withdrawal');
    });

    it('scores exact amount and similar narration', () => {
        const book = {
            movement: 'Deposit',
            amount: 10556,
            date: new Date('2026-05-04'),
            narration: 'Receipt from ABC',
            partyName: 'ABC',
            voucherNo: 'RV-1',
            bankReference: 'UTR123456',
            instrumentNo: '',
        };
        const bank = {
            drCr: 'Deposit',
            amount: 10556,
            txnDate: new Date('2026-06-06'),
            narration: 'ABC deposit',
            counterpartyName: 'ABC',
            utrRef: 'UTR123456',
            chequeNo: '',
        };
        const { score } = scorePair(book, bank, { ...DEFAULT_MATCH_CONFIG, dateToleranceDays: 60 });
        assert.ok(score >= DEFAULT_MATCH_CONFIG.possibleThreshold);
    });

    it('rejects direction mismatch', () => {
        const book = { movement: 'Deposit', amount: 100, date: new Date(), narration: '', partyName: '', voucherNo: '', bankReference: '' };
        const bank = { drCr: 'Withdrawal', amount: 100, txnDate: new Date(), narration: '', counterpartyName: '', utrRef: '', chequeNo: '' };
        const { score } = scorePair(book, bank);
        assert.equal(score, 0);
    });

    it('classifies auto vs possible', () => {
        assert.equal(classifyScore(90), 'Auto');
        assert.equal(classifyScore(60), 'Possible');
        assert.equal(classifyScore(40), 'Unmatched');
    });

    it('greedy suggestMatches pairs one-to-one', () => {
        const bookLines = [
            {
                _id: 'b1',
                movement: 'Deposit',
                amount: 100,
                date: new Date('2026-01-01'),
                narration: 'Receipt ABC',
                partyName: 'ABC',
                voucherNo: 'RV-1',
                bankReference: 'UTR100',
                reconciled: false,
            },
        ];
        const bankLines = [
            {
                _id: 'k1',
                drCr: 'Deposit',
                amount: 100,
                txnDate: new Date('2026-01-02'),
                narration: 'ABC deposit',
                counterpartyName: 'ABC',
                utrRef: 'UTR100',
                chequeNo: '',
                matchStatus: 'Unmatched',
            },
        ];
        const s = suggestMatches(bookLines, bankLines, { ...DEFAULT_MATCH_CONFIG, dateToleranceDays: 30 });
        assert.equal(s.length, 1);
        assert.equal(String(s[0].bookRefId), 'b1');
    });

    it('textSimilarity finds overlap', () => {
        assert.ok(textSimilarity('abc trading co', 'payment abc trading') > 0.3);
    });

    it('amountsMatch within tolerance', () => {
        assert.ok(amountsMatch(100, 100.005, { amountToleranceAbs: 0.01 }));
        assert.ok(!amountsMatch(100, 101, { amountToleranceAbs: 0.01 }));
    });
});
