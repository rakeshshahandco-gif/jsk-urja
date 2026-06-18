import path from 'path';
import { extractTextFromScanFile } from './fileTextExtract.service.js';
import { parseInvoiceText, roundMoney } from './invoiceTextParser.js';

const MOCK = {
    purchase_invoice: {
        supplierName: 'Sample Supplier Pvt Ltd',
        supplierGstin: '27AABCS1429B1Z5',
        supplierInvoiceNo: 'INV-2024-001',
        invoiceDate: new Date().toISOString().split('T')[0],
        gstType: 'CGST / SGST',
        placeOfSupply: 'Maharashtra',
        items: [{ itemName: 'Raw Material A', qty: 10, rate: 100, gstRate: 18 }],
        grandTotal: 1180,
    },
    sales_invoice: {
        customerName: 'Sample Customer Ltd',
        customerGstin: '27AABCC1234D1Z5',
        poNumber: 'PO-1001',
        invoiceDate: new Date().toISOString().split('T')[0],
        gstType: 'CGST / SGST',
        items: [{ itemName: 'Finished Good X', qty: 2, rate: 5000, gstRate: 18 }],
        grandTotal: 11800,
    },
    expense_bill: {
        vendorName: 'Office Supplies Co',
        billNo: 'EXP-7788',
        billDate: new Date().toISOString().split('T')[0],
        narration: 'Office stationery and printing',
        taxableAmount: 1000,
        cgst: 90,
        sgst: 90,
        igst: 0,
        grandTotal: 1180,
        suggestedKeywords: ['office', 'stationery', 'printing'],
    },
};

const REQUIRED_BY_MODULE = {
    purchase_invoice: ['supplierName', 'supplierInvoiceNo', 'invoiceDate', 'supplierGstin', 'grandTotal'],
    sales_invoice: ['customerName', 'invoiceDate', 'grandTotal'],
    expense_bill: ['vendorName', 'billNo', 'billDate', 'grandTotal'],
};

const MONEY_FIELDS = new Set([
    'taxableAmount', 'cgst', 'sgst', 'igst', 'freight', 'otherCharges', 'roundOff', 'grandTotal', 'cess',
]);

function hasFieldValue(key, data) {
    const v = data?.[key];
    if (key === 'items') return Array.isArray(v) && v.length > 0;
    if (MONEY_FIELDS.has(key)) return Number(v) > 0;
    if (v == null) return false;
    return String(v).trim() !== '';
}

function confidenceFor(data, moduleType = 'purchase_invoice') {
    const fields = {};
    const required = REQUIRED_BY_MODULE[moduleType] || REQUIRED_BY_MODULE.purchase_invoice;

    Object.keys(data || {}).forEach((k) => {
        if (k.startsWith('_')) return;
        if (!hasFieldValue(k, data)) {
            fields[k] = 'low';
        } else if (required.includes(k)) {
            fields[k] = 'high';
        } else {
            fields[k] = 'medium';
        }
    });

    const filledRequired = required.filter((k) => hasFieldValue(k, data)).length;
    const ratio = required.length ? filledRequired / required.length : 0;
    const overall = ratio >= 0.9 ? 'high' : ratio >= 0.6 ? 'medium' : 'low';

    return { fields, overall };
}

function normalizeExtractedData(data, moduleType) {
    if (!data || typeof data !== 'object') return {};
    const out = { ...data };

    for (const key of MONEY_FIELDS) {
        if (out[key] != null && out[key] !== '') out[key] = roundMoney(out[key]);
    }

    if (Array.isArray(out.items)) {
        out.items = out.items.map((row) => ({
            ...row,
            qty: Number(row.qty) || 0,
            rate: roundMoney(row.rate),
            amount: roundMoney(row.amount ?? (Number(row.qty) || 0) * (Number(row.rate) || 0)),
            gstRate: Number(row.gstRate) || 18,
        }));
    }

    if (moduleType === 'purchase_invoice' && out.supplierGstin) {
        out.supplierGstin = String(out.supplierGstin).trim().toUpperCase();
    }
    if (moduleType === 'sales_invoice' && out.customerGstin) {
        out.customerGstin = String(out.customerGstin).trim().toUpperCase();
    }

    return out;
}

function hasUsefulExtract(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.supplierName || data.customerName || data.vendorName || data.supplierGstin || data.customerGstin) return true;
    if (Number(data.grandTotal) > 0) return true;
    if (Array.isArray(data.items) && data.items.length > 0) return true;
    return false;
}

export async function runOcr({ moduleType, filePath, mimeType }) {
    const enabled = String(process.env.OCR_ENABLED || 'true').toLowerCase() !== 'false';
    const provider = (process.env.OCR_PROVIDER || 'mock').toLowerCase();
    if (!enabled || provider === 'disabled') {
        return {
            rawText: '',
            extractedData: {},
            confidence: { fields: {}, overall: 'low' },
            error: 'OCR is disabled. Fill details manually and attach this document.',
        };
    }

    let rawText = '';
    if (filePath) rawText = await extractTextFromScanFile(filePath, mimeType || '');

    let extractedData = {};
    if (rawText.length > 20) {
        extractedData = normalizeExtractedData(parseInvoiceText(rawText, moduleType), moduleType);
    }

    if (!hasUsefulExtract(extractedData) && provider === 'mock') {
        extractedData = normalizeExtractedData({ ...(MOCK[moduleType] || MOCK.purchase_invoice) }, moduleType);
        rawText = rawText || `[${provider.toUpperCase()} OCR MOCK fallback] ` + JSON.stringify(extractedData);
    }

    if (!hasUsefulExtract(extractedData) && ['openai', 'google', 'azure', 'tesseract'].includes(provider)) {
        return {
            rawText,
            extractedData: {},
            confidence: { fields: {}, overall: 'low' },
            error: `OCR provider "${provider}" is not configured yet. Set OCR_PROVIDER=mock or use PDF with selectable text.`,
        };
    }

    if (!hasUsefulExtract(extractedData)) {
        const ext = filePath ? path.extname(filePath).toLowerCase() : '';
        const hint = ext && !ext.includes('pdf')
            ? 'Image OCR needs external provider. For PDF bills, ensure text is selectable (not scanned image-only PDF).'
            : 'Could not read invoice details from this file. Fill details manually on review screen.';
        return {
            rawText,
            extractedData: extractedData || {},
            confidence: { fields: {}, overall: 'low' },
            error: hint,
        };
    }

    return {
        rawText: rawText || `[PARSED OCR] ${JSON.stringify(extractedData)}`,
        extractedData,
        confidence: confidenceFor(extractedData, moduleType),
    };
}
