import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQrText,
  getBarcodeValue,
  mergeBarcodeSettings,
  DEFAULT_INVOICE_BARCODE_SETTINGS,
  createPublicViewToken,
} from '../src/services/invoiceBarcode.service.js';

describe('invoiceBarcode.service', () => {
  const inv = {
    invoiceNumber: '26-27/125',
    displayInvoiceNumber: '26-27/125',
    invoiceDate: new Date('2026-05-18'),
    customerName: 'ABC Traders',
    customerGstin: '27ABCDE1234F1Z5',
    roundedTotal: 15560,
    publicViewToken: 'abc123token456',
    dispatchThrough: 'DISP-99',
  };

  const company = { companyName: 'JSK URJA', phone: '9876543210' };

  it('mergeBarcodeSettings applies defaults', () => {
    const s = mergeBarcodeSettings({ enableQr: false });
    assert.equal(s.enableQr, false);
    assert.equal(s.enableBarcode, DEFAULT_INVOICE_BARCODE_SETTINGS.enableBarcode);
  });

  it('buildQrText includes invoice fields', () => {
    const text = buildQrText(inv, company, { publicLinkEnabled: true });
    assert.match(text, /Invoice No: 26-27\/125/);
    assert.match(text, /ABC Traders/);
    assert.match(text, /GSTIN: 27ABCDE1234F1Z5/);
    assert.match(text, /public\/invoice\/abc123token456/);
  });

  it('getBarcodeValue uses invoice number by default', () => {
    assert.equal(getBarcodeValue(inv, {}), '26-27/125');
  });

  it('getBarcodeValue can use dispatch ref', () => {
    assert.equal(getBarcodeValue(inv, { includeDispatchBarcode: true }), 'DISP-99');
  });

  it('createPublicViewToken is long hex', () => {
    const t = createPublicViewToken();
    assert.ok(t.length >= 32);
    assert.match(t, /^[a-f0-9]+$/);
  });
});