/** Textile dyeing job-work challan - Handloom / TEXTILE template only. */

export const TEXTILE_DYEING_COLOUR_INSTRUCTIONS = [
    'FIXED_COLOUR',
    'DYER_CHOICE',
    'AS_PER_SAMPLE',
    'AS_PER_EXPERTISE',
];

export const TEXTILE_DYEING_COLOUR_LABELS = {
    FIXED_COLOUR: 'Fixed Colour',
    DYER_CHOICE: 'Dyer Choice',
    AS_PER_SAMPLE: 'As Per Sample',
    AS_PER_EXPERTISE: 'As Per Expertise',
};

export const TEXTILE_DYEING_CHALLAN_STATUS = [
    'Issued',
    'Partial Return',
    'Closed',
    'Cancelled',
];

export const TEXTILE_DYEING_RETURN_UOMS = ['Meter', 'PCS', 'Than', 'Roll', 'Set', 'Pair', 'KG'];

export const TEXTILE_DYEING_PCS_ROUND_MODES = ['ROUND_DOWN', 'ROUND_NEAREST', 'DECIMAL'];

export const TEXTILE_DYEING_PCS_ROUND_LABELS = {
    ROUND_DOWN: 'Round Down',
    ROUND_NEAREST: 'Round Nearest',
    DECIMAL: 'Allow Decimal PCS',
};

/** Labour rate types aligned with Job Work Rate Master */
export const TEXTILE_DYEING_LABOUR_RATE_TYPES = [
    'PER_METER',
    'PER_PCS',
    'PER_THAN',
    'FIXED_AMOUNT',
];

export const TEXTILE_DYEING_LABOUR_RATE_LABELS = {
    PER_METER: 'Per Meter',
    PER_PCS: 'Per PCS',
    PER_THAN: 'Per Than',
    FIXED_AMOUNT: 'Fixed Amount',
};

export function roundExpectedPcs(rawPcs, mode = 'ROUND_DOWN') {
    const raw = Number(rawPcs) || 0;
    if (mode === 'DECIMAL') return Math.round(raw * 1000) / 1000;
    if (mode === 'ROUND_NEAREST') return Math.round(raw);
    return Math.floor(raw);
}

export function calculateLineExpectedPcs({
    issuedMeter,
    meterPerPcs,
    pcsRoundMode = 'ROUND_DOWN',
    expectedLossPercent = 0,
}) {
    const issued = Number(issuedMeter) || 0;
    const mpp = Number(meterPerPcs) || 0;
    if (issued <= 0 || mpp <= 0) {
        return {
            rawPcs: 0,
            expectedPcs: 0,
            expectedReturnMeter: 0,
            expectedLossMeter: 0,
        };
    }
    const rawPcs = issued / mpp;
    const expectedPcs = roundExpectedPcs(rawPcs, pcsRoundMode);
    const expectedReturnMeter = Math.round(expectedPcs * mpp * 1000) / 1000;
    const balanceLoss = Math.round((issued - expectedReturnMeter) * 1000) / 1000;
    const pct = Number(expectedLossPercent) || 0;
    const plannedLossMeter = pct > 0 ? Math.round((issued * pct) / 100 * 1000) / 1000 : 0;
    const expectedLossMeter = Math.max(balanceLoss, plannedLossMeter);
    return {
        rawPcs: Math.round(rawPcs * 1000) / 1000,
        expectedPcs,
        expectedReturnMeter,
        expectedLossMeter,
    };
}

export function calculateLineLabour({
    issuedMeter,
    expectedPcs,
    rateType,
    rate,
    thanCount = 1,
}) {
    const r = Number(rate) || 0;
    if (!rateType || !r) {
        return { labourQtyBasis: '', labourAmount: 0 };
    }
    if (rateType === 'FIXED_AMOUNT') {
        return { labourQtyBasis: 'Fixed', labourAmount: Math.round(r * 100) / 100 };
    }
    let qty = 0;
    let basis = '';
    if (rateType === 'PER_METER') {
        qty = Number(issuedMeter) || 0;
        basis = `${qty} Meter`;
    } else if (rateType === 'PER_PCS') {
        qty = Number(expectedPcs) || 0;
        basis = `${qty} PCS`;
    } else if (rateType === 'PER_THAN') {
        qty = Math.max(1, Number(thanCount) || 1);
        basis = `${qty} Than`;
    }
    return {
        labourQtyBasis: basis,
        labourAmount: Math.round(qty * r * 100) / 100,
    };
}

export function summarizeChallanLines(lines = []) {
    let totalIssuedMeter = 0;
    let totalExpectedPcs = 0;
    let totalExpectedReturnMeter = 0;
    let totalExpectedLossMeter = 0;
    let totalLabourAmount = 0;
    for (const line of lines) {
        totalIssuedMeter += Number(line.issuedMeter) || 0;
        totalExpectedPcs += Number(line.expectedPcs) || 0;
        totalExpectedReturnMeter += Number(line.expectedReturnMeter) || 0;
        totalExpectedLossMeter += Number(line.expectedLossMeter) || 0;
        totalLabourAmount += Number(line.labourAmount) || 0;
    }
    return {
        totalIssuedMeter: Math.round(totalIssuedMeter * 1000) / 1000,
        totalExpectedPcs: Math.round(totalExpectedPcs * 1000) / 1000,
        totalExpectedReturnMeter: Math.round(totalExpectedReturnMeter * 1000) / 1000,
        totalExpectedLossMeter: Math.round(totalExpectedLossMeter * 1000) / 1000,
        totalLabourAmount: Math.round(totalLabourAmount * 100) / 100,
    };
}

export function formatColourInstruction(type, colourName = '') {
    const label = TEXTILE_DYEING_COLOUR_LABELS[type] || type;
    if (type === 'FIXED_COLOUR' && colourName) return colourName;
    return label;
}

export function buildChallanBarcodeValue(challanNo, dyerName, totalMeter, issueDate) {
    const d = issueDate ? new Date(issueDate).toISOString().slice(0, 10) : '';
    const safeDyer = String(dyerName || '').replace(/\|/g, ' ');
    return ['TDC', challanNo, safeDyer, String(totalMeter), d].join('|');
}

export function parseChallanBarcodeValue(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (s.startsWith('TDC|')) {
        const parts = s.split('|');
        return {
            challanNo: parts[1] || '',
            dyerName: parts[2] || '',
            totalMeter: parts[3] || '',
            issueDate: parts[4] || '',
        };
    }
    return { challanNo: s };
}
