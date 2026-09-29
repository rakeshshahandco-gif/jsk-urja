import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SI_CREATION_SOURCES,
    resolveWebCreationSource,
    formatInvoiceCreatedToast,
    formatCreationAudit,
    prefillInvoiceQtyFromRemaining,
    isUncertainInvoiceCreateFailure,
} from './salesInvoiceCreationUi.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Sales Invoice creation UI helpers', () => {
    it('maps SO form to WEB_SO_CONVERSION and blank form to WEB_NEW_INVOICE', () => {
        assert.equal(resolveWebCreationSource({ soId: 'abc' }), SI_CREATION_SOURCES.WEB_SO_CONVERSION);
        assert.equal(resolveWebCreationSource({}), SI_CREATION_SOURCES.WEB_NEW_INVOICE);
        assert.equal(resolveWebCreationSource({ isMobile: true }), SI_CREATION_SOURCES.MOBILE_NEW_INVOICE);
    });

    it('formats success toast with invoice number and created by', () => {
        assert.match(
            formatInvoiceCreatedToast('26-27/095', 'RAJESHREE GURAV'),
            /Tax Invoice 26-27\/095 created successfully/,
        );
        assert.match(formatInvoiceCreatedToast('26-27/095', 'RAJESHREE GURAV'), /Created by: RAJESHREE GURAV/);
    });

    it('exposes creation audit fields for the invoice details view', () => {
        const audit = formatCreationAudit({
            createdByName: 'RAJESHREE GURAV',
            createdAt: '2026-09-08T08:34:03.163Z',
            creationSource: 'WEB_SO_CONVERSION',
            soNumber: '26-27/0141',
            requestId: 'req-1',
            idempotencyKey: 'key-1',
        });
        assert.equal(audit.createdBy, 'RAJESHREE GURAV');
        assert.equal(audit.source, 'WEB_SO_CONVERSION');
        assert.equal(audit.soNumber, '26-27/0141');
        assert.equal(audit.requestId, 'req-1');
        assert.equal(audit.idempotencyKey, 'key-1');
    });

    it('never prefills original ordered qty when remaining is zero or negative', () => {
        assert.equal(prefillInvoiceQtyFromRemaining(10), 10);
        assert.equal(prefillInvoiceQtyFromRemaining(0), '');
        assert.equal(prefillInvoiceQtyFromRemaining(-2), '');
        assert.equal(prefillInvoiceQtyFromRemaining(null), '');
        const page = fs.readFileSync(path.join(__dirname, './SalesInvoiceFormPage.jsx'), 'utf8');
        assert.equal(page.includes('remaining > 0 ? remaining : (i.qty'), false);
        assert.equal(page.includes('remaining > 0 ? remaining : originalQty'), false);
        assert.match(page, /prefillInvoiceQtyFromRemaining/);
    });

    it('treats timeout and missing response as uncertain create, not a new submission', () => {
        assert.equal(isUncertainInvoiceCreateFailure({ code: 'ECONNABORTED' }), true);
        assert.equal(isUncertainInvoiceCreateFailure({ response: undefined }), true);
        assert.equal(isUncertainInvoiceCreateFailure({ response: { status: 500 } }), true);
        assert.equal(isUncertainInvoiceCreateFailure({ response: { status: 400 } }), false);
    });

    it('locks Create Tax Invoice on first click and navigates away after success', () => {
        const page = fs.readFileSync(path.join(__dirname, './SalesInvoiceFormPage.jsx'), 'utf8');
        assert.match(page, /submitLockRef/);
        assert.match(page, /Creating Invoice\.\.\./);
        assert.match(page, /Checking whether the invoice was created/);
        assert.match(page, /Create Tax Invoice/);
        assert.match(page, /replace:\s*true/);
        assert.match(page, /idempotencyKeyRef/);
        assert.match(page, /requestIdRef/);
        assert.match(page, /createdInvoiceIdRef/);
        assert.match(page, /formatInvoiceCreatedToast/);
    });
});
