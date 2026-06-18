/** Reusable textile job-work process engine (Handloom / TEXTILE only). */

export const TEXTILE_JOB_WORK_PROCESS_TYPES = [
    'Dyeing',
    'Embroidery',
    'Printing',
    'Washing',
    'Pressing',
    'Finishing',
    'Stitching',
    'Packing',
];

export const PROCESS_CHALLAN_PREFIX = {
    Dyeing: 'TDC',
    Embroidery: 'TEC',
    Printing: 'TPC',
    Washing: 'TWC',
    Pressing: 'TPRC',
    Finishing: 'TFC',
    Stitching: 'TSC',
    Packing: 'TPKC',
};

export const PROCESS_BARCODE_PREFIX = {
    Dyeing: 'TDC',
    Embroidery: 'TEC',
    Printing: 'TPC',
    Washing: 'TWC',
    Pressing: 'TPRC',
    Finishing: 'TFC',
    Stitching: 'TSC',
    Packing: 'TPKC',
};

export const PROCESS_VENDOR_WAREHOUSE = {
    Dyeing: 'Stock With Dyer',
    Embroidery: 'Stock With Embroidery Vendor',
    Printing: 'Stock With Printer',
    Washing: 'Stock With Washer',
    Pressing: 'Stock With Pressing Vendor',
    Finishing: 'Stock With Finishing Vendor',
    Stitching: 'Stock With Stitching Vendor',
    Packing: 'Stock With Packing Vendor',
};

export function normalizeProcessType(value, fallback = 'Dyeing') {
    const v = String(value || fallback).trim();
    const match = TEXTILE_JOB_WORK_PROCESS_TYPES.find((p) => p.toLowerCase() === v.toLowerCase());
    return match || fallback;
}

export function getChallanNoPrefix(processType, fy) {
    const code = PROCESS_CHALLAN_PREFIX[normalizeProcessType(processType)] || 'TJC';
    return `${code}-${fy}-`;
}

export function buildProcessBarcodeValue(processType, challanNo, vendorName, totalQty, issueDate) {
    const prefix = PROCESS_BARCODE_PREFIX[normalizeProcessType(processType)] || 'TJC';
    const d = issueDate ? new Date(issueDate).toISOString().slice(0, 10) : '';
    const safeVendor = String(vendorName || '').replace(/\|/g, ' ');
    return [prefix, challanNo, safeVendor, String(totalQty), d].join('|');
}

export function parseProcessBarcodeValue(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const prefixes = Object.values(PROCESS_BARCODE_PREFIX);
    const head = s.split('|')[0];
    if (prefixes.includes(head)) {
        const parts = s.split('|');
        return {
            processType: Object.entries(PROCESS_BARCODE_PREFIX).find(([, p]) => p === head)?.[0] || 'Dyeing',
            challanNo: parts[1] || '',
            vendorName: parts[2] || '',
            totalQty: parts[3] || '',
            issueDate: parts[4] || '',
        };
    }
    if (s.startsWith('TDC|')) {
        const parts = s.split('|');
        return { processType: 'Dyeing', challanNo: parts[1] || '', vendorName: parts[2] || '', totalQty: parts[3] || '', issueDate: parts[4] || '' };
    }
    return { processType: null, challanNo: s };
}

export {
    TEXTILE_DYEING_COLOUR_INSTRUCTIONS as TEXTILE_JOB_WORK_INSTRUCTION_TYPES,
    TEXTILE_DYEING_COLOUR_LABELS as TEXTILE_JOB_WORK_INSTRUCTION_LABELS,
    TEXTILE_DYEING_CHALLAN_STATUS as TEXTILE_JOB_WORK_CHALLAN_STATUS,
    TEXTILE_DYEING_RETURN_UOMS as TEXTILE_JOB_WORK_RETURN_UOMS,
    TEXTILE_DYEING_PCS_ROUND_MODES as TEXTILE_JOB_WORK_PCS_ROUND_MODES,
    TEXTILE_DYEING_PCS_ROUND_LABELS as TEXTILE_JOB_WORK_PCS_ROUND_LABELS,
    TEXTILE_DYEING_LABOUR_RATE_TYPES as TEXTILE_JOB_WORK_LABOUR_RATE_TYPES,
    TEXTILE_DYEING_LABOUR_RATE_LABELS as TEXTILE_JOB_WORK_LABOUR_RATE_LABELS,
    calculateLineExpectedPcs,
    calculateLineLabour,
    summarizeChallanLines,
} from './textileDyeingChallan.constants.js';
