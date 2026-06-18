/** Textile-only job work processes (Handloom / TEXTILE template). */
export const TEXTILE_JOB_WORK_PROCESSES = [
    'Dyeing',
    'Printing',
    'Embroidery',
    'Stitching',
    'Washing',
    'Pressing',
    'Packing',
];

export const TEXTILE_RATE_TYPES = [
    'PER_METER',
    'PER_PCS',
    'PER_THAN',
    'PER_KG',
    'PER_ROLL',
    'PER_DESIGN',
    'FIXED_AMOUNT',
];

export const TEXTILE_RATE_TYPE_LABELS = {
    PER_METER: 'Per Meter',
    PER_PCS: 'Per PCS',
    PER_THAN: 'Per Than',
    PER_KG: 'Per KG',
    PER_ROLL: 'Per Roll',
    PER_DESIGN: 'Per Design',
    FIXED_AMOUNT: 'Fixed Amount',
};

export const TEXTILE_PARTY_TYPES = ['vendor', 'worker'];

/** Map workflow stage names → job work process for rate lookup. */
export function processNameFromStageName(stageName = '') {
    const n = String(stageName).toLowerCase();
    if (n.includes('dye')) return 'Dyeing';
    if (n.includes('print')) return 'Printing';
    if (n.includes('embroid')) return 'Embroidery';
    if (n.includes('stitch')) return 'Stitching';
    if (n.includes('wash')) return 'Washing';
    if (n.includes('press')) return 'Pressing';
    if (n.includes('pack')) return 'Packing';
    return '';
}

export function calculateLabourCost(quantity, rate, rateType) {
    const q = Number(quantity) || 0;
    const r = Number(rate) || 0;
    if (rateType === 'FIXED_AMOUNT') return Math.round(r * 100) / 100;
    return Math.round(q * r * 100) / 100;
}
