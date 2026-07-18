import {
    buildDefaultFieldsMap,
    getColumnCatalog,
} from './printFormatFieldCatalog.js';

export const PRINT_FORMAT_DOC_TYPES = Object.freeze(['Sales Order', 'Sales Invoice']);
export const PRINT_FORMAT_PAPER_SIZES = Object.freeze(['A4', 'Letter', 'Legal', 'Custom']);
export const PRINT_FORMAT_ORIENTATIONS = Object.freeze(['portrait', 'landscape']);
/** draft = designer only; approved = selectable; approved + isDefault = Active Default (live print) */
export const PRINT_FORMAT_STATUSES = Object.freeze(['draft', 'approved', 'published']);
export const LIVE_PRINT_FORMAT_STATUS = 'approved';
export const PRINT_FORMAT_SOURCES = Object.freeze(['original', 'blank', 'copy', 'custom']);
export const PRINT_LAYOUT_SECTIONS = Object.freeze([
  'header', 'companyDetails', 'customerDetails', 'documentDetails', 'itemTable',
  'totalsBox', 'remarks', 'terms', 'bankDetails', 'signature',
]);
export const PRINT_READ_ONLY_DATA_FIELDS = Object.freeze({
  'Sales Order': ['soNumber', 'soDate', 'customerName', 'qty', 'rate', 'amount', 'totalAmount', 'roundedTotal'],
  'Sales Invoice': ['invoiceNumber', 'invoiceDate', 'customerName', 'qty', 'rate', 'taxableAmount', 'roundedTotal'],
});
const defaultMargins = { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' };
const baseSections = () => PRINT_LAYOUT_SECTIONS.reduce((acc, key) => {
  acc[key] = { visible: true, order: PRINT_LAYOUT_SECTIONS.indexOf(key) + 1 };
  return acc;
}, {});
export const SALES_ORDER_ORIGINAL_LAYOUT = Object.freeze({
  source: 'original',
  reference: 'Jsk Urja069.pdf / SO 26-27/069',
  docType: 'Sales Order',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { ...defaultMargins },
  customPaper: null,
  pageWidthMm: 210,
  contentWidthMm: 190,
  sections: baseSections(),
  itemTable: { layout: 'fixed', useFullWidth: true, totalsInTable: true, columns: [] },
  engineVersion: 1,
});
export const SALES_INVOICE_ORIGINAL_LAYOUT = Object.freeze({
  source: 'original',
  reference: '046.pdf / A4 194mm (JSK_INVOICE_A4_LOCKED_RIGHT_TOTALS)',
  docType: 'Sales Invoice',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { ...defaultMargins },
  customPaper: null,
  pageWidthMm: 210,
  contentWidthMm: 190,
  sections: baseSections(),
  itemTable: { layout: 'fixed', useFullWidth: true, totalsInTable: false, columns: [] },
  engineVersion: 1,
});
const pfBlock = (x, y, width, height, extra = {}) => ({ x, y, width, height, visible: true, align: 'left', fontSize: 10, bold: false, border: false, ...extra });
const SO_ORIGINAL_BLOCKS = {
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
const SI_ORIGINAL_BLOCKS = {
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
function buildOriginalLayoutV2(docType) {
  const blocks = docType === 'Sales Order' ? SO_ORIGINAL_BLOCKS : SI_ORIGINAL_BLOCKS;
  const sections = Object.keys(blocks).reduce((acc, key, i) => {
    acc[key] = { visible: blocks[key].visible !== false, order: i + 1 };
    return acc;
  }, {});
  return {
    engineVersion: 3,
    source: 'original',
    reference: docType === 'Sales Order' ? 'Jsk Urja069.pdf / SO 26-27/069' : '046.pdf / Invoice 26-27/046 (JSK_INVOICE_046_LOCKED)',
    docType,
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { ...defaultMargins },
    customPaper: null,
    pageWidthMm: 210,
    contentWidthMm: 190,
    blocks: JSON.parse(JSON.stringify(blocks)),
    fields: buildDefaultFieldsMap(docType),
    itemTable: {
      layout: 'fixed',
      useFullWidth: true,
      totalsInTable: docType === 'Sales Order',
      columns: getColumnCatalog(docType),
    },
    sections,
  };
}
export const BLANK_PRINT_LAYOUT = (docType) => ({
  source: 'blank',
  reference: 'Blank template',
  docType,
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { ...defaultMargins },
  customPaper: null,
  pageWidthMm: 210,
  contentWidthMm: 190,
  sections: PRINT_LAYOUT_SECTIONS.reduce((acc, key) => {
    acc[key] = { visible: key === 'header' || key === 'itemTable', order: PRINT_LAYOUT_SECTIONS.indexOf(key) + 1 };
    return acc;
  }, {}),
  itemTable: { layout: 'fixed', useFullWidth: true, columns: [], totalsInTable: true },
  engineVersion: 1,
});
export function getOriginalPrintLayout(docType) {
  if (docType === 'Sales Order') return buildOriginalLayoutV2('Sales Order');
  if (docType === 'Sales Invoice') return buildOriginalLayoutV2('Sales Invoice');
  throw new Error('Unsupported document type: ' + docType);
}

/** Placeholder document for layout-only designer preview (values not saved). */
export function buildLayoutPreviewDocument(docType) {
  const now = new Date().toISOString();
  if (docType === 'Sales Order') {
    return {
      _layoutPreview: true,
      soNumber: '26-27/069',
      soDate: now,
      deliveryDate: now,
      customerPO: 'VERBAL',
      customerName: 'Sample Customer Pvt Ltd',
      billingAddress: '123 Sample Street, Andheri East, Mumbai - 400069, Maharashtra',
      shippingAddress: '123 Sample Street, Andheri East, Mumbai - 400069, Maharashtra',
      customerGstin: '27AAAAA0000A1Z5',
      gstApplicable: true,
      orderCategory: 'Order',
      items: [
        { itemCode: 'JU-001', description: 'SAMPLE PRODUCT A', additionalNotes: '—', hsnCode: '8504', uom: 'NOS', qty: 2, rate: 1500, amount: 3000 },
        { itemCode: 'JU-002', description: 'SAMPLE PRODUCT B', additionalNotes: 'Layout preview', hsnCode: '8504', uom: 'NOS', qty: 1, rate: 2500, amount: 2500 },
      ],
      subtotal: 5500,
      totalAmount: 5500,
      totalTaxableAmount: 5500,
      totalCgst: 495,
      totalSgst: 495,
      grandTotal: 6490,
      roundedTotal: 6490,
      remarks: 'Sample remarks — layout preview only.',
    };
  }
  return {
    _layoutPreview: true,
    invoiceNumber: '26-27/001',
    displayInvoiceNumber: '26-27/001',
    invoiceDate: now,
    customerName: 'Sample Customer Pvt Ltd',
    billingAddress: '123 Sample Street, Mumbai, Maharashtra',
    placeOfSupply: 'Maharashtra',
    gstApplicable: true,
    items: [
      { itemCode: 'JU-001', description: 'SAMPLE ITEM', hsnCode: '8504', uom: 'NOS', qty: 1, rate: 5000, taxableAmount: 5000 },
    ],
    totalTaxableAmount: 5000,
    taxableAmount: 5000,
    grandTotal: 5900,
    roundedTotal: 5900,
    remarks: 'Sample invoice — layout preview only.',
  };
}
