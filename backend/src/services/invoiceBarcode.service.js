/**
 * Sales Invoice QR + Barcode (Code128) generation and secure lookup.
 */
import crypto from 'crypto';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';

export const DEFAULT_INVOICE_BARCODE_SETTINGS = {
  enableQr: true,
  enableBarcode: true,
  qrSize: 96,
  barcodeHeight: 40,
  barcodeType: 'code128',
  publicLinkEnabled: false,
  paymentLink: '',
  websiteUrl: '',
  includeDispatchBarcode: false,
};

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

function fmtAmount(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function mergeBarcodeSettings(profileSettings = {}) {
  return { ...DEFAULT_INVOICE_BARCODE_SETTINGS, ...(profileSettings || {}) };
}

export async function getInvoiceBarcodeSettings(companyId) {
  const profile = companyId
    ? await CompanyProfile.findOne({ companyId }).select('invoiceBarcodeSettings companyName phone gstNumber').lean()
    : await CompanyProfile.findOne({}).select('invoiceBarcodeSettings companyName phone gstNumber').lean();
  return {
    settings: mergeBarcodeSettings(profile?.invoiceBarcodeSettings),
    company: profile || {},
  };
}

export function getPublicInvoiceBaseUrl() {
  const base = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:4000';
  return String(base).replace(/\/$/, '');
}

export function buildQrText(inv, company = {}, settings = {}) {
  const lines = [
    `Invoice No: ${inv.displayInvoiceNumber || inv.invoiceNumber || ''}`,
    `Date: ${fmtDate(inv.invoiceDate)}`,
    `Customer: ${inv.customerName || ''}`,
    `Amount: ${fmtAmount(inv.roundedTotal ?? inv.grandTotal)}`,
  ];
  if (inv.customerGstin) lines.push(`GSTIN: ${inv.customerGstin}`);
  if (company.companyName) lines.push(`Company: ${company.companyName}`);
  if (company.phone) lines.push(`Mobile: ${company.phone}`);
  if (settings.paymentLink) lines.push(`Payment: ${settings.paymentLink}`);
  if (settings.websiteUrl) lines.push(`Web: ${settings.websiteUrl}`);
  if (settings.publicLinkEnabled && inv.publicViewToken) {
    lines.push(`View: ${getPublicInvoiceBaseUrl()}/public/invoice/${inv.publicViewToken}`);
  }
  return lines.filter(Boolean).join('\n');
}

export function getBarcodeValue(inv, settings = {}) {
  if (settings.includeDispatchBarcode && inv.dispatchThrough) {
    return String(inv.dispatchThrough).trim();
  }
  return String(inv.displayInvoiceNumber || inv.invoiceNumber || '').trim();
}

export async function generateQrDataUrl(text, size = 96) {
  return QRCode.toDataURL(text, {
    width: Math.max(64, Math.min(256, Number(size) || 96)),
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

export async function generateBarcodeDataUrl(value, barcodeType = 'code128', height = 40) {
  const text = String(value || '').trim();
  if (!text) return null;
  const bcid = barcodeType === 'qrcode' ? 'qrcode' : 'code128';
  const png = await bwipjs.toBuffer({
    bcid,
    text,
    scale: 2,
    height: Math.max(8, Math.min(80, Number(height) || 40)),
    includetext: true,
    textxalign: 'center',
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}

export function createPublicViewToken() {
  return crypto.randomBytes(24).toString('hex');
}

export async function ensureInvoicePublicToken(invoice, companyId, session = null) {
  const { settings } = await getInvoiceBarcodeSettings(companyId);
  if (!settings.publicLinkEnabled) return invoice;
  if (invoice.publicViewToken) return invoice;

  invoice.publicViewToken = createPublicViewToken();
  const q = SalesInvoice.updateOne(
    { _id: invoice._id },
    { $set: { publicViewToken: invoice.publicViewToken } },
  );
  if (session) await q.session(session);
  else await q.exec();
  return invoice;
}

export async function buildInvoiceBarcodePayload(inv, companyId) {
  const { settings, company } = await getInvoiceBarcodeSettings(companyId);
  const qrText = buildQrText(inv, company, settings);
  const barcodeValue = getBarcodeValue(inv, settings);

  const payload = {
    settings,
    invoiceNumber: inv.invoiceNumber,
    displayInvoiceNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
    qrText,
    barcodeValue,
    publicUrl: settings.publicLinkEnabled && inv.publicViewToken
      ? `${getPublicInvoiceBaseUrl()}/public/invoice/${inv.publicViewToken}`
      : null,
    qrDataUrl: null,
    barcodeDataUrl: null,
  };

  if (settings.enableQr) {
    payload.qrDataUrl = await generateQrDataUrl(qrText, settings.qrSize);
  }
  if (settings.enableBarcode && barcodeValue) {
    payload.barcodeDataUrl = await generateBarcodeDataUrl(
      barcodeValue,
      settings.barcodeType,
      settings.barcodeHeight,
    );
  }
  return payload;
}

export async function lookupInvoiceByCode(code, companyId) {
  const raw = String(code || '').trim();
  if (!raw) return null;

  let token = raw;
  const publicMatch = raw.match(/\/public\/invoice\/([a-f0-9]+)/i);
  if (publicMatch) token = publicMatch[1];

  const baseQuery = { isDeleted: { $ne: true } };
  if (companyId) baseQuery.companyId = companyId;

  const or = [
    { publicViewToken: token },
    { invoiceNumber: raw },
    { displayInvoiceNumber: raw },
  ];

  const inv = await SalesInvoice.findOne({ ...baseQuery, $or: or })
    .select('_id invoiceNumber displayInvoiceNumber invoiceDate customerName customerGstin roundedTotal grandTotal paymentStatus status publicViewToken')
    .lean();

  return inv;
}

export async function getPublicInvoiceByToken(token) {
  const t = String(token || '').trim();
  if (!t || t.length < 16) return null;

  const inv = await SalesInvoice.findOne({
    publicViewToken: t,
    isDeleted: { $ne: true },
  }).lean();

  if (!inv) return null;

  const company = await CompanyProfile.findOne(
    inv.companyId ? { companyId: inv.companyId } : {},
  ).select('companyName phone gstNumber address city state pincode logoUrl').lean();

  return {
    invoice: {
      invoiceNumber: inv.invoiceNumber,
      displayInvoiceNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      customerName: inv.customerName,
      customerGstin: inv.customerGstin,
      billingAddress: inv.billingAddress,
      roundedTotal: inv.roundedTotal ?? inv.grandTotal,
      paymentStatus: inv.paymentStatus,
      status: inv.status,
      items: (inv.items || []).map((i) => ({
        itemCode: i.itemCode,
        itemName: i.itemName,
        qty: i.qty,
        uom: i.uom,
        rate: i.rate,
        totalAmount: i.totalAmount,
      })),
    },
    company: company || {},
  };
}
