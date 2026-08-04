/**
 * Phase 4A — Customer Credit Note allocation contracts (no DB).
 * Run: node --test backend/test/creditNoteAllocation.phase4a.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Phase 4A Credit Note allocation — source contracts', () => {
    it('uses BillWiseAdjustment as authority with SI target + CN source', () => {
        const svc = fs.readFileSync(
            path.join(__dirname, '../src/services/creditNoteAllocation.service.js'),
            'utf8',
        );
        assert.match(svc, /settlementSourceType:\s*'CreditDebitNote'/);
        assert.match(svc, /billDocumentType:\s*'SalesInvoice'/);
        assert.match(svc, /postCustomerCreditNoteAccounting/);
        assert.match(svc, /availableBalance/);
        assert.match(svc, /accounts\.bill_adjustment\.use_credit_note/);
        assert.doesNotMatch(svc, /supplierId/);
        assert.doesNotMatch(svc, /PurchaseInvoice/);
    });

    it('disables unsafe CN-as-bill stub in settlement engine', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../src/services/accounting/billWiseSettlement.service.js'),
            'utf8',
        );
        assert.match(src, /Credit Note cannot be used as the bill target/);
    });

    it('cancel guard and finalize Option B are wired in controller', () => {
        const ctrl = fs.readFileSync(
            path.join(__dirname, '../src/controllers/creditDebitNote.controller.js'),
            'utf8',
        );
        assert.match(ctrl, /Reverse the bill allocations before cancelling/);
        assert.match(ctrl, /Cancel with automatic voucher reversal is not enabled/);
        assert.match(ctrl, /postCustomerCreditNoteAccounting/);
        assert.match(ctrl, /getAvailableCustomerCreditNotes/);
    });

    it('permission registry exposes bill_adjustment CN keys', () => {
        const reg = fs.readFileSync(
            path.join(__dirname, '../src/config/permissionRegistry.js'),
            'utf8',
        );
        assert.match(reg, /view_note_balance/);
        assert.match(reg, /use_credit_note/);
        assert.match(reg, /reverse_note_allocation/);
    });
});
