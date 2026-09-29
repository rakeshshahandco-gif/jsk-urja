/**
 * Sales Document forensic audit — logging helpers only.
 * Run: node --test backend/test/salesDocumentAudit.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    actorFromRequest,
    diffChangedFields,
    diffSalesOrderManual,
    ensureSalesRequestId,
    snapshotSalesOrderBillingLink,
    snapshotSalesOrderManual,
} from '../src/utils/salesDocumentAudit.util.js';
import { SALES_DOC_AUDIT_ACTIONS } from '../src/constants/salesDocumentAudit.constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../src');

function read(rel) {
    return fs.readFileSync(path.join(srcRoot, rel), 'utf8');
}

describe('Sales document audit diffs', () => {
    it('records only changed qty/rate/status and never remaining qty', () => {
        const before = snapshotSalesOrderManual({
            soNumber: 'SO-1',
            status: 'Confirmed',
            invoiceId: null,
            items: [{ _id: 'l1', itemName: 'LED', qty: 100, rate: 250 }],
        });
        const after = snapshotSalesOrderManual({
            soNumber: 'SO-1',
            status: 'Confirmed',
            invoiceId: null,
            items: [{ _id: 'l1', itemName: 'LED', qty: 120, rate: 245 }],
        });
        after.remainingQty = 20;
        before.remainingQty = 100;
        const changed = diffSalesOrderManual(before, after);
        assert.deepEqual(changed.map((c) => c.field).sort(), ['items.l1.qty', 'items.l1.rate']);
        assert.equal(changed.find((c) => c.field.includes('qty')).from, 100);
        assert.equal(changed.find((c) => c.field.includes('qty')).to, 120);
        assert.equal(JSON.stringify(changed).includes('remaining'), false);
    });

    it('billing recalc diffs only status and invoiceId', () => {
        const before = snapshotSalesOrderBillingLink({ status: 'Confirmed', invoiceId: null, soNumber: 'SO-1' });
        const after = snapshotSalesOrderBillingLink({ status: 'Invoiced', invoiceId: 'inv1', soNumber: 'SO-1' });
        const changed = diffChangedFields(before, after, ['status', 'invoiceId']);
        assert.deepEqual(changed.map((c) => c.field).sort(), ['invoiceId', 'status']);
        assert.equal(Object.keys(before).includes('qty'), false);
    });
});

describe('Sales document audit actor and requestId', () => {
    it('attributes SYSTEM when no logged-in user is present', () => {
        const actor = actorFromRequest({});
        assert.equal(actor.actorType, 'SYSTEM');
        assert.equal(actor.actorUserId, null);
    });

    it('attributes USER when req.user initiated the request', () => {
        const actor = actorFromRequest({
            user: { _id: 'u1', name: 'Rajeshree Gurav', username: 'rajeshree', roleName: 'staff' },
        });
        assert.equal(actor.actorType, 'USER');
        assert.equal(actor.actorUsername, 'rajeshree');
        assert.equal(actor.actorRole, 'staff');
    });

    it('preserves a frontend requestId', () => {
        const req = { headers: { 'x-request-id': 'client-req-1' } };
        assert.equal(ensureSalesRequestId(req, {}), 'client-req-1');
        assert.equal(ensureSalesRequestId(req, { requestId: 'other' }), 'client-req-1');
    });
});

describe('Audit writer never throws', () => {
    it('swallows write errors so financial posting is not rolled back', () => {
        const src = read('services/salesDocumentAudit.service.js');
        assert.match(src, /Never throws to the caller/);
        assert.match(src, /financial document was not rolled back/);
        assert.match(src, /return false/);
    });
});

describe('Forensic hooks are present and remaining-qty business rule is untouched', () => {
    it('invoice controller logs create/cancel/restore/delete after commit', () => {
        const src = read('controllers/salesInvoice.controller.js');
        assert.match(src, /SI_CREATE/);
        assert.match(src, /SI_CANCEL/);
        assert.match(src, /SI_RESTORE/);
        assert.match(src, /SI_DELETE/);
        assert.match(src, /SI_IDEMPOTENT_REPLAY/);
        assert.match(src, /SI_DUPLICATE_ATTEMPT/);
        assert.match(src, /recordSoBillingRecalcIfChanged/);
        const createIdx = src.indexOf('export const createSalesInvoice');
        const commitIdx = src.indexOf('await session.commitTransaction()', createIdx);
        const auditIdx = src.indexOf('SALES_DOC_AUDIT_ACTIONS.SI_CREATE', createIdx);
        assert.ok(auditIdx > commitIdx);
    });

    it('sales order controller logs create/update/cancel/restore/delete', () => {
        const src = read('controllers/salesOrder.controller.js');
        assert.match(src, /SO_CREATE/);
        assert.match(src, /SO_UPDATE/);
        assert.match(src, /SO_CANCEL/);
        assert.match(src, /SO_RESTORE/);
        assert.match(src, /SO_DELETE/);
    });

    it('does not change remaining-qty prefill or over-invoice block', () => {
        const form = fs.readFileSync(path.join(__dirname, '../../src/features/sales/SalesInvoiceFormPage.jsx'), 'utf8');
        assert.match(form, /prefillInvoiceQtyFromRemaining/);
        assert.equal(form.includes('remaining > 0 ? remaining : (i.qty'), false);
        assert.equal(Object.values(SALES_DOC_AUDIT_ACTIONS).includes('SI_CREATE'), true);
    });
});
