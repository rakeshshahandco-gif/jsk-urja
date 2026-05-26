import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildLedgerFilter,
    resolveOutstandingAmount,
    getTypeConfig,
} from '../src/services/outstandingReport.service.js';

describe('outstandingReport.service', () => {
    it('buildLedgerFilter receivable group-wise', () => {
        const groupId = '507f1f77bcf86cd799439011';
        const { filter } = buildLedgerFilter({ type: 'Receivable', viewMode: 'group', groupId });
        assert.ok(filter.$or);
        assert.equal(String(filter.underGroup), groupId);
    });

    it('buildLedgerFilter ledger-wise', () => {
        const ledgerId = '507f1f77bcf86cd799439012';
        const { filter } = buildLedgerFilter({ type: 'Payable', viewMode: 'ledger', ledgerId });
        assert.equal(String(filter._id), ledgerId);
    });

    it('resolveOutstandingAmount prefers open bills', () => {
        const config = getTypeConfig('Receivable');
        const { outstanding, isOutstanding } = resolveOutstandingAmount({ currentBalance: 0 }, 'Receivable', config, 5000);
        assert.equal(outstanding, 5000);
        assert.equal(isOutstanding, true);
    });

    it('resolveOutstandingAmount excludes wrong-sign payable balance', () => {
        const config = getTypeConfig('Payable');
        const { isOutstanding } = resolveOutstandingAmount({ currentBalance: 500 }, 'Payable', config, 0);
        assert.equal(isOutstanding, false);
    });
});
