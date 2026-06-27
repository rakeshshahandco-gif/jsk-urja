import { parsePurchaseInvoiceText } from '../src/services/scanEntry/invoiceTextParser.js';

const FINE_TRACK_SAMPLE = `
Fine Track Industries Pvt Ltd
Plot 12, MIDC Industrial Area
Maharashtra, Maharashtra - 400101
GSTIN : 27AACCJ9679B1ZA
PAN : AACCJ9679B

TAX INVOICE
Invoice No : FT/24-25/1847
Invoice Date : 15-03-2025
PO Number : PO-7782
LR No : LR-99231
Vehicle No : MH-04-AB-1234

Description HSN Qty Rate Amount
Electronic Component 85371000 100 95.71 9571.00
Taxable Value 9571.00
CGST @ 9% 861.39
SGST @ 9% 861.39
Freight 50.00
Other Charges 30.34
Grand Total 12474.12
`;

const parsed = parsePurchaseInvoiceText(FINE_TRACK_SAMPLE);
const checks = [
    ['supplierName', parsed.supplierName, 'Fine Track Industries Pvt Ltd'],
    ['supplierGstin', parsed.supplierGstin, '27AACCJ9679B1ZA'],
    ['supplierInvoiceNo', parsed.supplierInvoiceNo, 'FT/24-25/1847'],
    ['taxableAmount', parsed.taxableAmount, 9571],
    ['cgst', parsed.cgst, 861.39],
    ['sgst', parsed.sgst, 861.39],
    ['grandTotal', parsed.grandTotal, 12474.12],
];

let failed = 0;
for (const [field, got, want] of checks) {
    const ok = field.includes('Amount') || field.includes('cgst') || field.includes('sgst') || field.includes('grandTotal')
        ? Math.abs(Number(got) - Number(want)) < 0.02
        : String(got).includes(String(want).slice(0, 8));
    console.log(`${ok ? 'PASS' : 'FAIL'} ${field}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    if (!ok) failed += 1;
}

if (parsed.supplierName.includes('400101')) {
    console.log('FAIL supplier must not be address line');
    failed += 1;
} else {
    console.log('PASS supplier is not address line');
}

process.exit(failed ? 1 : 0);
