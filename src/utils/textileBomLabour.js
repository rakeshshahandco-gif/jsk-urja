/** Textile BOM — process-wise labour / job work costing (Handloom only). */

export const TEXTILE_BOM_LABOUR_PROCESSES = [
    'Dyeing',
    'Printing',
    'Embroidery',
    'Stitching',
    'Washing',
    'Pressing',
    'Finishing',
    'Packing',
    'Other',
];

export const TEXTILE_BOM_RATE_TYPES = [
    { value: 'PER_METER', label: 'Per Meter', uom: 'Meter' },
    { value: 'PER_PCS', label: 'Per PCS', uom: 'PCS' },
    { value: 'PER_THAN', label: 'Per Than', uom: 'Than' },
    { value: 'PER_ROLL', label: 'Per Roll', uom: 'Roll' },
    { value: 'PER_KG', label: 'Per KG', uom: 'KG' },
    { value: 'PER_DESIGN', label: 'Per Design', uom: 'Design' },
    { value: 'FIXED_AMOUNT', label: 'Fixed Amount', uom: '' },
];

export function qtyBasisUomForRateType(rateType) {
    return TEXTILE_BOM_RATE_TYPES.find((t) => t.value === rateType)?.uom || '';
}

export function rateTypeLabel(rateType) {
    return TEXTILE_BOM_RATE_TYPES.find((t) => t.value === rateType)?.label || rateType;
}

export function calcTextileLabourAmount(qtyBasis, rate, rateType) {
    const q = Number(qtyBasis) || 0;
    const r = Number(rate) || 0;
    if (rateType === 'FIXED_AMOUNT') return Math.round(r * 100) / 100;
    return Math.round(q * r * 100) / 100;
}

export const BLANK_TEXTILE_PROCESS_LABOUR = () => ({
    processName: 'Dyeing',
    vendorWorker: '',
    rateType: 'PER_METER',
    qtyBasis: '',
    qtyBasisUom: 'Meter',
    rate: '',
    amount: 0,
    remarks: '',
});
