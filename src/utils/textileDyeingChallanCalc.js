/** Client-side mirror of backend textile dyeing challan calculations (Textile/Handloom only). */

export const PCS_ROUND_MODES = [
    { value: 'ROUND_DOWN', label: 'Round Down' },
    { value: 'ROUND_NEAREST', label: 'Round Nearest' },
    { value: 'DECIMAL', label: 'Allow Decimal PCS' },
];

export const LABOUR_RATE_TYPES = [
    { value: 'PER_METER', label: 'Per Meter' },
    { value: 'PER_PCS', label: 'Per PCS' },
    { value: 'PER_THAN', label: 'Per Than' },
    { value: 'FIXED_AMOUNT', label: 'Fixed Amount' },
];

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
        return { rawPcs: 0, expectedPcs: 0, expectedReturnMeter: 0, expectedLossMeter: 0 };
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
    if (!rateType || !r) return { labourQtyBasis: '', labourAmount: 0 };
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
    return { labourQtyBasis: basis, labourAmount: Math.round(qty * r * 100) / 100 };
}

export function enrichLineCalculations(line) {
    const uom = String(line.issuedUom || 'Meter').toUpperCase();
    let issuedMeter = Number(line.issuedMeter) || 0;
    const issuedQty = Number(line.issuedQty) || 0;
    const mpp = Number(line.meterPerPcs) || 0;
    if (uom === 'PCS' && issuedQty > 0 && mpp > 0) issuedMeter = Math.round(issuedQty * mpp * 1000) / 1000;
    else if (!issuedMeter && issuedQty > 0) issuedMeter = issuedQty;

    const pcs = calculateLineExpectedPcs({
        issuedMeter,
        meterPerPcs: line.meterPerPcs,
        pcsRoundMode: line.pcsRoundMode || 'ROUND_DOWN',
        expectedLossPercent: line.expectedLossPercent,
    });
    const labour = calculateLineLabour({
        issuedMeter,
        expectedPcs: pcs.expectedPcs,
        rateType: line.labourRateType,
        rate: line.labourRate,
        thanCount: line.thanNo ? 1 : 1,
    });
    return { ...line, issuedMeter, ...pcs, ...labour };
}

export function summarizeLines(lines) {
    const enriched = lines.map(enrichLineCalculations);
    return enriched.reduce((acc, l) => ({
        totalIssuedMeter: acc.totalIssuedMeter + (Number(l.issuedMeter) || 0),
        totalExpectedPcs: acc.totalExpectedPcs + (Number(l.expectedPcs) || 0),
        totalExpectedReturnMeter: acc.totalExpectedReturnMeter + (Number(l.expectedReturnMeter) || 0),
        totalExpectedLossMeter: acc.totalExpectedLossMeter + (Number(l.expectedLossMeter) || 0),
        totalLabourAmount: acc.totalLabourAmount + (Number(l.labourAmount) || 0),
    }), {
        totalIssuedMeter: 0,
        totalExpectedPcs: 0,
        totalExpectedReturnMeter: 0,
        totalExpectedLossMeter: 0,
        totalLabourAmount: 0,
    });
}
