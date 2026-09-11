/**
 * Sales Invoice creation protection — no DB posting required.
 * Run: node --test backend/test/salesInvoiceCreationProtection.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SI_CREATION_SOURCES,
    SO_FULLY_INVOICED_MESSAGE,
    SO_QTY_EXCEEDS_REMAINING_MESSAGE,
} from '../src/constants/salesInvoiceCreation.constants.js';
import { resolveSalesInvoiceCreationSource } from '../src/utils/salesInvoiceCreationAudit.util.js';
import { shouldBlockInvoiceForRemainingQty } from '../src/utils/salesOrderBilling.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../src');

function read(rel) {
    return fs.readFileSync(path.join(srcRoot, rel), 'utf8');
}

describe('Sales Invoice creation source', () => {
    it('never resolves UNKNOWN and maps known routes', () => {
        assert.equal(resolveSalesInvoiceCreationSource({ hintedSource: 'WEB_SO_CONVERSION' }), SI_CREATION_SOURCES.WEB_SO_CONVERSION);
        assert.equal(resolveSalesInvoiceCreationSource({
            requestPath: '/api/v1/sales-orders/abc/create-tax-invoice',
            linkedSoId: 'abc',
        }), SI_CREATION_SOURCES.API_SO_CONVERSION);
        assert.equal(resolveSalesInvoiceCreationSource({
            requestPath: '/api/v1/scan-entry/drafts/1/post',
        }), SI_CREATION_SOURCES.SCAN_ENTRY_POST);
        assert.equal(resolveSalesInvoiceCreationSource({ linkedSoId: 'so1' }), SI_CREATION_SOURCES.WEB_SO_CONVERSION);
        assert.equal(resolveSalesInvoiceCreationSource({ userAgent: 'Mozilla/5.0 iPhone' }), SI_CREATION_SOURCES.MOBILE_NEW_INVOICE);
        assert.equal(resolveSalesInvoiceCreationSource({}), SI_CREATION_SOURCES.WEB_NEW_INVOICE);
        assert.notEqual(resolveSalesInvoiceCreationSource({ hintedSource: 'UNKNOWN' }), 'UNKNOWN');
    });
});

describe('Remaining qty hard block — partial OK, full duplicate blocked', () => {
    const lineId = 'line-1';
    const so = { items: [{ _id: lineId, itemId: 'item-1', itemName: 'LED', qty: 100 }] };

    it('allows a first full invoice of remaining qty 100', () => {
        const snap = {
            fullyInvoiced: false,
            anyInvoiced: false,
            activeInvoices: [],
            lines: [{ lineId, orderedQty: 100, invoicedQty: 0, remainingQty: 100 }],
        };
        const result = shouldBlockInvoiceForRemainingQty(so, [{ salesOrderLineId: lineId, qty: 100 }], snap);
        assert.equal(result.blocked, false);
    });

    it('allows legitimate partial invoices 50 + remaining 50', () => {
        const first = shouldBlockInvoiceForRemainingQty(so, [{ salesOrderLineId: lineId, qty: 50 }], {
            fullyInvoiced: false, anyInvoiced: false, activeInvoices: [],
            lines: [{ lineId, orderedQty: 100, invoicedQty: 0, remainingQty: 100 }],
        });
        assert.equal(first.blocked, false);
        const second = shouldBlockInvoiceForRemainingQty(so, [{ salesOrderLineId: lineId, qty: 50 }], {
            fullyInvoiced: false, anyInvoiced: true, activeInvoices: [{ _id: 'inv1' }],
            lines: [{ lineId, orderedQty: 100, invoicedQty: 50, remainingQty: 50 }],
        });
        assert.equal(second.blocked, false);
    });

    it('blocks a second full invoice of the same 100 qty', () => {
        const result = shouldBlockInvoiceForRemainingQty(so, [{ salesOrderLineId: lineId, qty: 100 }], {
            fullyInvoiced: true, anyInvoiced: true, activeInvoices: [{ _id: 'inv1' }],
            lines: [{ lineId, orderedQty: 100, invoicedQty: 100, remainingQty: 0 }],
        });
        assert.equal(result.blocked, true);
        assert.equal(result.message, SO_FULLY_INVOICED_MESSAGE);
        assert.equal(result.code, 'SO_ALREADY_INVOICED');
    });

    it('blocks qty that exceeds remaining on a partial SO', () => {
        const result = shouldBlockInvoiceForRemainingQty(so, [{ salesOrderLineId: lineId, qty: 60 }], {
            fullyInvoiced: false, anyInvoiced: true, activeInvoices: [{ _id: 'inv1' }],
            lines: [{ lineId, orderedQty: 100, invoicedQty: 50, remainingQty: 50 }],
        });
        assert.equal(result.blocked, true);
        assert.equal(result.message, SO_QTY_EXCEEDS_REMAINING_MESSAGE);
    });
});

describe('No hidden automatic Sales Invoice creation', () => {
    const cronDir = path.join(srcRoot, 'cron');
    const cronFiles = fs.existsSync(cronDir)
        ? fs.readdirSync(cronDir).filter((f) => f.endsWith('.js'))
        : [];

    it('cron jobs never call createSalesInvoice', () => {
        for (const file of cronFiles) {
            const src = fs.readFileSync(path.join(cronDir, file), 'utf8');
            assert.doesNotMatch(src, /createSalesInvoice/);
            assert.doesNotMatch(src, /SalesInvoice\.create/);
        }
    });

    it('Sales Order Confirm / createSO does not create a Tax Invoice', () => {
        const soCtrl = read('controllers/salesOrder.controller.js');
        const start = soCtrl.indexOf('export const createSO');
        const next = soCtrl.indexOf('export const', start + 1);
        const createFn = soCtrl.slice(start, next > start ? next : undefined);
        assert.doesNotMatch(createFn, /createSalesInvoice/);
        const restoreStart = soCtrl.indexOf('export const restoreSO');
        const restoreFn = soCtrl.slice(restoreStart);
        assert.doesNotMatch(restoreFn, /createSalesInvoice/);
    });

    it('createSalesInvoice is only invoked from invoice POST, SO convert API, and Scan Entry post', () => {
        const invoiceCtrl = read('controllers/salesInvoice.controller.js');
        const soCtrl = read('controllers/salesOrder.controller.js');
        const posting = read('services/scanEntry/posting.service.js');
        assert.match(invoiceCtrl, /export const createSalesInvoice/);
        assert.match(soCtrl, /createTaxInvoiceFromSalesOrder/);
        assert.match(soCtrl, /createSalesInvoice/);
        assert.match(posting, /createSalesInvoice/);
        const createFnStart = invoiceCtrl.indexOf('export const createSalesInvoice');
        const createFn = invoiceCtrl.slice(createFnStart, invoiceCtrl.indexOf('export const getSalesInvoices'));
        assert.match(createFn, /creationSource/);
        assert.match(createFn, /idempotencyKey/);
        assert.match(createFn, /SI_DUPLICATE_ATTEMPT_AUDIT/);
        assert.match(createFn, /shouldBlockInvoiceForRemainingQty/);
        assert.match(createFn, /getNextNumberFromSeries/);
        const blockPos = createFn.indexOf('shouldBlockInvoiceForRemainingQty');
        const numberPos = createFn.indexOf('getNextNumberFromSeries');
        assert.ok(blockPos > 0 && numberPos > blockPos, 'qty block must run before series allocation');
    });
});
