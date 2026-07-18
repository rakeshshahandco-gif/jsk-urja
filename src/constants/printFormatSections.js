import {
    getColumnCatalog,
    mergeColumns as mergeColumnsFromCatalog,
    buildDefaultFieldsMap,
    mergeFields,
} from './printFormatFieldCatalog.js';

export const PRINT_LAYOUT_SECTIONS = [
    'header',
    'companyDetails',
    'customerDetails',
    'documentDetails',
    'itemTable',
    'totalsBox',
    'remarks',
    'terms',
    'bankDetails',
    'signature',
];

export const PRINT_BLOCK_IDS = [
    'logo',
    'companyDetails',
    'documentTitle',
    'documentNumber',
    'customerDetails',
    'documentDetails',
    'itemTable',
    'totalsBox',
    'remarks',
    'terms',
    'bankDetails',
    'signature',
];

export const BLOCK_LABELS = {
    logo: 'Logo',
    companyDetails: 'Company Details',
    documentTitle: 'Document Title',
    documentNumber: 'SO / Invoice Number',
    customerDetails: 'Customer Details',
    documentDetails: 'Document Details',
    itemTable: 'Item Table',
    totalsBox: 'Total Box',
    remarks: 'Remarks',
    terms: 'Terms',
    bankDetails: 'Bank Details',
    signature: 'Signature',
};

export const SO_TABLE_COLUMNS = [
    { id: 'sr', label: 'SR', widthPct: 4, visible: true, align: 'center' },
    { id: 'itemCode', label: 'ITEM CODE', widthPct: 10, visible: true, align: 'left' },
    { id: 'description', label: 'DESCRIPTION', widthPct: 28, visible: true, align: 'left' },
    { id: 'notes', label: 'NOTES', widthPct: 12, visible: true, align: 'left' },
    { id: 'hsn', label: 'HSN', widthPct: 7, visible: true, align: 'center' },
    { id: 'qty', label: 'QTY', widthPct: 7, visible: true, align: 'center' },
    { id: 'rate', label: 'RATE', widthPct: 10, visible: true, align: 'right' },
    { id: 'amount', label: 'AMOUNT', widthPct: 12, visible: true, align: 'right' },
    { id: 'spacer', label: '', widthPct: 10, visible: true, align: 'center' },
];

export const SI_TABLE_COLUMNS = [
    { id: 'sr', label: 'SR', widthPct: 5, visible: true, align: 'center' },
    { id: 'description', label: 'ITEM DESCRIPTION', widthPct: 35, visible: true, align: 'left' },
    { id: 'hsn', label: 'HSN/SAC', widthPct: 10, visible: true, align: 'center' },
    { id: 'uom', label: 'UOM', widthPct: 8, visible: true, align: 'center' },
    { id: 'qty', label: 'QTY', widthPct: 8, visible: true, align: 'center' },
    { id: 'rate', label: 'RATE', widthPct: 14, visible: true, align: 'right' },
    { id: 'amount', label: 'AMOUNT', widthPct: 20, visible: true, align: 'right' },
];

const pfBlock = (x, y, width, height, extra = {}) => ({
    x, y, width, height, visible: true, align: 'left', fontSize: 10, bold: false, border: false, ...extra,
});

export const SO_DEFAULT_BLOCKS = {
    logo: pfBlock(0, 0, 28, 20),
    companyDetails: pfBlock(30, 0, 88, 22, { fontSize: 9 }),
    documentTitle: pfBlock(122, 0, 68, 8, { align: 'right', fontSize: 16, bold: true }),
    documentNumber: pfBlock(122, 10, 68, 8, { align: 'right', fontSize: 14, bold: true }),
    customerDetails: pfBlock(0, 26, 92, 34, { fontSize: 10 }),
    documentDetails: pfBlock(98, 26, 92, 34, { fontSize: 10 }),
    itemTable: pfBlock(0, 62, 190, 100, { fontSize: 9, border: true }),
    totalsBox: pfBlock(0, 164, 190, 36, { align: 'right', fontSize: 10, border: true }),
    remarks: pfBlock(0, 202, 92, 18, { fontSize: 9, border: true }),
    terms: pfBlock(0, 222, 92, 16, { fontSize: 8, visible: false }),
    bankDetails: pfBlock(0, 222, 92, 18, { fontSize: 8 }),
    signature: pfBlock(118, 222, 72, 20, { align: 'center', fontSize: 9, bold: true, border: true }),
};

export const SI_DEFAULT_BLOCKS = {
    logo: pfBlock(0, 0, 28, 18),
    companyDetails: pfBlock(30, 0, 92, 22, { fontSize: 8.5 }),
    documentTitle: pfBlock(122, 0, 68, 10, { align: 'right', fontSize: 13, bold: true, border: true }),
    documentNumber: pfBlock(122, 12, 68, 8, { align: 'right', fontSize: 10, bold: true }),
    customerDetails: pfBlock(0, 24, 95, 26, { fontSize: 9 }),
    documentDetails: pfBlock(95, 24, 95, 26, { fontSize: 8 }),
    itemTable: pfBlock(0, 52, 190, 92, { fontSize: 8, border: true }),
    totalsBox: pfBlock(95, 146, 95, 46, { align: 'right', fontSize: 9, border: true }),
    remarks: pfBlock(0, 146, 92, 22, { fontSize: 9 }),
    bankDetails: pfBlock(0, 170, 92, 18, { fontSize: 8 }),
    terms: pfBlock(0, 190, 92, 16, { fontSize: 7.5 }),
    signature: pfBlock(95, 190, 95, 20, { align: 'center', fontSize: 9, bold: true, border: true }),
};

export function getDefaultBlocks(docType) {
    const src = docType === 'Sales Invoice' ? SI_DEFAULT_BLOCKS : SO_DEFAULT_BLOCKS;
    return JSON.parse(JSON.stringify(src));
}

export function getDefaultColumns(docType) {
    return getColumnCatalog(docType);
}

export function mergeColumns(saved = [], docType) {
    return mergeColumnsFromCatalog(saved, docType);
}

export function mergeBlocks(saved = {}, docType) {
    const defaults = getDefaultBlocks(docType);
    const out = { ...defaults };
    Object.keys(defaults).forEach((id) => {
        out[id] = { ...defaults[id], ...(saved[id] || {}) };
    });
    return out;
}

export function buildLayoutV2(docType) {
    const sections = {};
    PRINT_BLOCK_IDS.forEach((id, i) => { sections[id] = { visible: true, order: i + 1 }; });
    return {
        engineVersion: 3,
        source: 'original',
        reference: docType === 'Sales Order' ? 'Jsk Urja069.pdf / SO 26-27/069' : '046.pdf / A4 194mm (JSK_INVOICE_A4_LOCKED_RIGHT_TOTALS)',
        docType,
        pageWidthMm: 210,
        contentWidthMm: 190,
        blocks: getDefaultBlocks(docType),
        fields: buildDefaultFieldsMap(docType),
        itemTable: {
            layout: 'fixed',
            useFullWidth: true,
            totalsInTable: docType === 'Sales Order',
            columns: getDefaultColumns(docType),
        },
        sections,
    };
}

export { mergeFields, buildDefaultFieldsMap, getColumnCatalog };
