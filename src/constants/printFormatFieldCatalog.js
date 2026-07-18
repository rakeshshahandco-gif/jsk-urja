/** Printable field & column catalog — layout only; values from CRM data. */

const pfField = (id, label, group, extra = {}) => ({
    id, label, group, onCanvas: false, visible: true, x: 0, y: 0, width: 90, height: 8,
    align: 'left', fontSize: 9, bold: false, border: false, ...extra,
});

const col = (id, label, widthPct, align, extra = {}) => ({
    id, label, widthPct, visible: extra.visible !== false, align,
    headerAlign: extra.headerAlign ?? align, fontSize: extra.fontSize ?? 9,
    order: extra.order ?? 0, ...extra,
});

export const SO_FIELD_CATALOG = [
    pfField('logo', 'Company Logo', 'Company', { isBlock: true, onCanvas: true, x: 0, y: 0, width: 28, height: 20 }),
    pfField('companyName', 'Company Name', 'Company', { x: 30, y: 0, width: 88, height: 6, bold: true, fontSize: 11 }),
    pfField('companyAddress', 'Company Address', 'Company', { x: 30, y: 7, width: 88, height: 10, fontSize: 8.5 }),
    pfField('companyGstin', 'Company GSTIN', 'Company', { x: 30, y: 18, width: 88, height: 5, fontSize: 8.5 }),
    pfField('companyPhone', 'Company Phone / Email', 'Company', { x: 30, y: 23, width: 88, height: 5, fontSize: 8, visible: false }),
    pfField('documentTitle', 'Document Title', 'Document', { isBlock: true, onCanvas: true, x: 122, y: 0, width: 68, height: 8, align: 'right', fontSize: 16, bold: true }),
    pfField('soNumber', 'Sales Order Number', 'Document', { isBlock: true, blockKey: 'documentNumber', onCanvas: true, x: 122, y: 10, width: 68, height: 8, align: 'right', fontSize: 14, bold: true }),
    pfField('soDate', 'Sales Order Date', 'Document', { x: 98, y: 26, width: 44, height: 5 }),
    pfField('deliveryDate', 'Delivery Date', 'Document', { x: 98, y: 32, width: 44, height: 5 }),
    pfField('customerPO', 'Customer PO', 'Document', { x: 98, y: 38, width: 44, height: 5 }),
    pfField('orderCategory', 'Order Category', 'Document', { x: 142, y: 26, width: 48, height: 5 }),
    pfField('dispatchThrough', 'Dispatch / Transport', 'Document', { x: 142, y: 32, width: 48, height: 5, visible: false }),
    pfField('customerName', 'Customer Name', 'Customer', { x: 0, y: 26, width: 92, height: 6, bold: true }),
    pfField('customerAddress', 'Customer Address', 'Customer', { x: 0, y: 33, width: 92, height: 12, fontSize: 9 }),
    pfField('customerGstin', 'Customer GSTIN', 'Customer', { x: 0, y: 46, width: 92, height: 5, fontSize: 9 }),
    pfField('customerPhone', 'Customer Phone', 'Customer', { x: 0, y: 52, width: 44, height: 5, visible: false }),
    pfField('customerEmail', 'Customer Email', 'Customer', { x: 46, y: 52, width: 46, height: 5, visible: false }),
    pfField('customerDetails', 'Customer Block', 'Customer', { isBlock: true, onCanvas: true, x: 0, y: 26, width: 92, height: 34 }),
    pfField('documentDetails', 'Document Details Block', 'Document', { isBlock: true, onCanvas: true, x: 98, y: 26, width: 92, height: 34 }),
    pfField('companyDetails', 'Company Block', 'Company', { isBlock: true, onCanvas: true, x: 30, y: 0, width: 88, height: 22, fontSize: 9 }),
    pfField('itemTable', 'Item Table', 'Items', { isBlock: true, onCanvas: true, x: 0, y: 62, width: 190, height: 100, fontSize: 9, border: true }),
    pfField('totalBeforeTax', 'Total Before Tax', 'Totals', { x: 100, y: 164, width: 90, height: 5, align: 'right', onCanvas: true }),
    pfField('freight', 'Freight', 'Totals', { x: 100, y: 170, width: 90, height: 5, align: 'right', onCanvas: true }),
    pfField('totalTaxableAmount', 'Total Taxable Amount', 'Totals', { x: 100, y: 176, width: 90, height: 5, align: 'right', onCanvas: true }),
    pfField('cgst', 'CGST', 'Totals', { x: 100, y: 182, width: 90, height: 5, align: 'right', onCanvas: true }),
    pfField('sgst', 'SGST', 'Totals', { x: 100, y: 188, width: 90, height: 5, align: 'right', onCanvas: true }),
    pfField('igst', 'IGST', 'Totals', { x: 100, y: 182, width: 90, height: 5, align: 'right', visible: false }),
    pfField('totalGst', 'Total GST', 'Totals', { x: 100, y: 194, width: 90, height: 5, align: 'right', visible: false }),
    pfField('roundOff', 'Round Off', 'Totals', { x: 100, y: 200, width: 90, height: 5, align: 'right', onCanvas: true }),
    pfField('grandTotal', 'Grand Total', 'Totals', { x: 100, y: 206, width: 90, height: 6, align: 'right', bold: true, onCanvas: true }),
    pfField('amountInWords', 'Amount in Words', 'Totals', { x: 0, y: 214, width: 120, height: 8, onCanvas: true }),
    pfField('totalsBox', 'Totals Block', 'Totals', { isBlock: true, onCanvas: true, x: 0, y: 164, width: 190, height: 36, align: 'right', border: true }),
    pfField('remarks', 'Remarks', 'Footer', { isBlock: true, onCanvas: true, x: 0, y: 202, width: 92, height: 18, border: true }),
    pfField('terms', 'Terms', 'Footer', { x: 0, y: 222, width: 92, height: 16, fontSize: 8, visible: false }),
    pfField('bankDetails', 'Bank Details', 'Footer', { isBlock: true, onCanvas: true, x: 0, y: 222, width: 92, height: 18, fontSize: 8 }),
    pfField('signature', 'Signature', 'Footer', { isBlock: true, onCanvas: true, x: 118, y: 222, width: 72, height: 20, align: 'center', bold: true, border: true }),
];

export const SI_FIELD_CATALOG = [
    pfField('logo', 'Company Logo', 'Company', { isBlock: true, onCanvas: true, x: 0, y: 0, width: 28, height: 18 }),
    pfField('companyName', 'Company Name', 'Company', { x: 30, y: 0, width: 90, height: 6, bold: true, fontSize: 11 }),
    pfField('companyAddress', 'Company Address', 'Company', { x: 30, y: 7, width: 90, height: 10, fontSize: 8.5 }),
    pfField('companyGstin', 'Company GSTIN', 'Company', { x: 30, y: 18, width: 90, height: 5, fontSize: 8.5 }),
    pfField('companyDetails', 'Company Block', 'Company', { isBlock: true, onCanvas: true, x: 30, y: 0, width: 90, height: 22, fontSize: 8.5 }),
    pfField('documentTitle', 'Invoice Title', 'Document', { isBlock: true, onCanvas: true, x: 125, y: 0, width: 65, height: 10, align: 'right', fontSize: 13, bold: true, border: true }),
    pfField('invoiceNumber', 'Invoice Number', 'Document', { isBlock: true, blockKey: 'documentNumber', onCanvas: true, x: 125, y: 12, width: 65, height: 8, align: 'right', bold: true }),
    pfField('invoiceDate', 'Invoice Date', 'Document', { x: 96, y: 24, width: 44, height: 5 }),
    pfField('placeOfSupply', 'Place of Supply', 'Document', { x: 142, y: 24, width: 48, height: 5 }),
    pfField('buyerOrderNo', 'Buyer Order No', 'Document', { x: 96, y: 30, width: 44, height: 5 }),
    pfField('paymentTerms', 'Payment Terms', 'Document', { x: 142, y: 30, width: 48, height: 5 }),
    pfField('dispatchThrough', 'Dispatch Through', 'Document', { x: 96, y: 36, width: 44, height: 5, visible: false }),
    pfField('lrNumber', 'LR / Docket', 'Document', { x: 142, y: 36, width: 48, height: 5, visible: false }),
    pfField('customerName', 'Customer Name', 'Customer', { x: 0, y: 24, width: 95, height: 6, bold: true }),
    pfField('customerAddress', 'Bill To', 'Customer', { x: 0, y: 31, width: 95, height: 10, fontSize: 9 }),
    pfField('customerGstin', 'Customer GSTIN', 'Customer', { x: 0, y: 42, width: 95, height: 5, fontSize: 9 }),
    pfField('shippingAddress', 'Ship To', 'Customer', { x: 96, y: 42, width: 94, height: 10, visible: false }),
    pfField('customerDetails', 'Customer Block', 'Customer', { isBlock: true, onCanvas: true, x: 0, y: 24, width: 95, height: 28 }),
    pfField('documentDetails', 'Document Block', 'Document', { isBlock: true, onCanvas: true, x: 96, y: 24, width: 94, height: 28 }),
    pfField('itemTable', 'Item Table', 'Items', { isBlock: true, onCanvas: true, x: 0, y: 54, width: 190, height: 110, border: true }),
    pfField('totalTaxableValue', 'Total Taxable Value', 'Totals', { x: 95, y: 166, width: 95, height: 5, align: 'right', onCanvas: true }),
    pfField('cgst', 'CGST', 'Totals', { x: 95, y: 172, width: 95, height: 5, align: 'right', onCanvas: true }),
    pfField('sgst', 'SGST', 'Totals', { x: 95, y: 178, width: 95, height: 5, align: 'right', onCanvas: true }),
    pfField('igst', 'IGST', 'Totals', { x: 95, y: 172, width: 95, height: 5, align: 'right', visible: false }),
    pfField('freight', 'Freight', 'Totals', { x: 95, y: 184, width: 95, height: 5, align: 'right', onCanvas: true }),
    pfField('roundOff', 'Round Off', 'Totals', { x: 95, y: 190, width: 95, height: 5, align: 'right', onCanvas: true }),
    pfField('grandTotal', 'Grand Total', 'Totals', { x: 95, y: 196, width: 95, height: 6, align: 'right', bold: true, onCanvas: true }),
    pfField('amountInWords', 'Amount in Words', 'Totals', { x: 0, y: 204, width: 90, height: 8, onCanvas: true }),
    pfField('totalsBox', 'Totals Block', 'Totals', { isBlock: true, onCanvas: true, x: 95, y: 166, width: 95, height: 50, align: 'right', border: true }),
    pfField('remarks', 'Remarks', 'Footer', { isBlock: true, onCanvas: true, x: 0, y: 166, width: 90, height: 24 }),
    pfField('terms', 'Terms', 'Footer', { isBlock: true, onCanvas: true, x: 0, y: 214, width: 90, height: 18, fontSize: 7.5 }),
    pfField('bankDetails', 'Bank Details', 'Footer', { isBlock: true, onCanvas: true, x: 0, y: 192, width: 90, height: 20, fontSize: 8 }),
    pfField('signature', 'Signature', 'Footer', { isBlock: true, onCanvas: true, x: 95, y: 218, width: 95, height: 18, align: 'center', border: true }),
];

export const SO_COLUMN_CATALOG = [
    col('sr', 'SR', 4, 'center', { order: 1 }),
    col('itemCode', 'ITEM CODE', 9, 'left', { order: 2 }),
    col('itemName', 'ITEM NAME', 10, 'left', { order: 3, visible: false }),
    col('description', 'DESCRIPTION', 22, 'left', { order: 4 }),
    col('notes', 'NOTES', 10, 'left', { order: 5 }),
    col('hsn', 'HSN', 6, 'center', { order: 6 }),
    col('qty', 'QTY', 5, 'center', { order: 7 }),
    col('uom', 'UOM', 5, 'center', { order: 8 }),
    col('rate', 'RATE', 8, 'right', { order: 9 }),
    col('discount', 'DISCOUNT', 6, 'right', { order: 10, visible: false }),
    col('taxableAmount', 'TAXABLE AMT', 8, 'right', { order: 11, visible: false }),
    col('gstPercent', 'GST %', 5, 'center', { order: 12, visible: false }),
    col('cgst', 'CGST', 6, 'right', { order: 13, visible: false }),
    col('sgst', 'SGST', 6, 'right', { order: 14, visible: false }),
    col('igst', 'IGST', 6, 'right', { order: 15, visible: false }),
    col('amount', 'AMOUNT', 10, 'right', { order: 16 }),
];

export const SI_COLUMN_CATALOG = [
    col('sr', 'SR', 4, 'center', { order: 1 }),
    col('itemCode', 'ITEM CODE', 8, 'left', { order: 2, visible: false }),
    col('itemName', 'ITEM NAME', 10, 'left', { order: 3, visible: false }),
    col('description', 'ITEM DESCRIPTION', 28, 'left', { order: 4 }),
    col('hsn', 'HSN/SAC', 8, 'center', { order: 5 }),
    col('uom', 'UOM', 5, 'center', { order: 6 }),
    col('qty', 'QTY', 5, 'center', { order: 7 }),
    col('rate', 'RATE', 10, 'right', { order: 8 }),
    col('discount', 'DISCOUNT', 6, 'right', { order: 9, visible: false }),
    col('taxableAmount', 'TAXABLE VALUE', 9, 'right', { order: 10, visible: false }),
    col('gstPercent', 'GST %', 5, 'center', { order: 11, visible: false }),
    col('cgst', 'CGST', 6, 'right', { order: 12, visible: false }),
    col('sgst', 'SGST', 6, 'right', { order: 13, visible: false }),
    col('igst', 'IGST', 6, 'right', { order: 14, visible: false }),
    col('amount', 'AMOUNT', 12, 'right', { order: 15 }),
];

export function getFieldCatalog(docType) {
    const src = docType === 'Sales Invoice' ? SI_FIELD_CATALOG : SO_FIELD_CATALOG;
    return JSON.parse(JSON.stringify(src));
}

export function getColumnCatalog(docType) {
    return JSON.parse(JSON.stringify(docType === 'Sales Invoice' ? SI_COLUMN_CATALOG : SO_COLUMN_CATALOG))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function buildDefaultFieldsMap(docType) {
    const out = {};
    getFieldCatalog(docType).forEach((f) => {
        const { id, label, group, isBlock, blockKey, ...layout } = f;
        out[id] = { ...layout, visible: layout.visible !== false };
    });
    return out;
}

export function mergeFields(saved = {}, docType) {
    const out = {};
    getFieldCatalog(docType).forEach((f) => {
        const { id, label, group, isBlock, blockKey, ...defaults } = f;
        out[id] = { ...defaults, ...(saved[id] || {}) };
    });
    return out;
}

export function mergeColumns(saved = [], docType) {
    const catalog = getColumnCatalog(docType);
    const savedMap = Object.fromEntries((saved || []).map((c) => [c.id, c]));
    return catalog.map((c) => ({ ...c, ...(savedMap[c.id] || {}) }))
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export function getBlockFieldIds(docType) {
    return getFieldCatalog(docType).filter((f) => f.isBlock).map((f) => f.blockKey || f.id);
}
