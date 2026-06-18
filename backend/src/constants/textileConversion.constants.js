/** Textile transformation process types (Handloom / TEXTILE template only). */
export const TEXTILE_TRANSFORMATION_PROCESSES = [
    'Dyeing',
    'Printing',
    'Embroidery',
    'Stitching',
    'Washing',
    'Pressing',
    'Finishing',
    'Packing',
];

/** Common textile UOMs for conversion master. */
export const TEXTILE_CONVERSION_UOMS = [
    'Meter',
    'Than',
    'PCS',
    'Suit Set',
    'Kurti',
    'Dupatta',
    'Roll',
    'KG',
];

/**
 * RATIO — auto output from input (e.g. 5 Meter = 1 PCS).
 * VARIABLE — operator enters output qty (e.g. Than → Meter, dyeing with loss).
 */
export const TEXTILE_FORMULA_TYPES = ['RATIO', 'VARIABLE'];

export const TEXTILE_FORMULA_TYPE_LABELS = {
    RATIO: 'Fixed Ratio (auto calculate)',
    VARIABLE: 'Variable Output (manual entry)',
};

/**
 * Compute expected output qty from conversion master.
 * @returns {{ outputQty: number, lossQty: number|null, lossPercent: number|null }}
 */
export function calculateTransformationOutput({
    formulaType,
    inputQtyPerOutput,
    expectedLossPercent,
    inputQty,
    outputQtyOverride,
}) {
    const input = Number(inputQty) || 0;
    if (input <= 0) {
        return { outputQty: 0, lossQty: null, lossPercent: null };
    }

    if (formulaType === 'RATIO' && inputQtyPerOutput > 0) {
        const outputQty = Math.floor((input / Number(inputQtyPerOutput)) * 10000) / 10000;
        return { outputQty, lossQty: null, lossPercent: expectedLossPercent ?? null };
    }

    const outputQty = outputQtyOverride != null ? Number(outputQtyOverride) : 0;
    const lossQty = input > outputQty ? input - outputQty : 0;
    const lossPercent = input > 0 && lossQty > 0 ? Math.round((lossQty / input) * 10000) / 100 : 0;
    return { outputQty, lossQty, lossPercent };
}

/** Build display formula string e.g. "5 Meter = 1 PCS". */
export function formatConversionFormula({ formulaType, inputQtyPerOutput, inputUom, outputUom }) {
    if (formulaType === 'VARIABLE') return `Variable ${outputUom || 'output'} entry`;
    const ratio = Number(inputQtyPerOutput) || 0;
    if (!ratio) return '';
    return `${ratio} ${inputUom || 'Input'} = 1 ${outputUom || 'Output'}`;
}
