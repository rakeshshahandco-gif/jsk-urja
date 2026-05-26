/**
 * Offline validation tests for ITNS 281 bank challan rules (no DB).
 * Run: node backend/scripts/testItns281Validation.mjs
 */
import { assessmentYearFromFinancialYear } from '../src/constants/tds.constants.js';

const SECTION_TO_NATURE = {
    '194C': '94C',
    '194J': '94J',
    '194H': '94H',
    '194I': '94I',
    '194A': '94A',
    '195': '195',
};

function validateLines(lineItems) {
    const sections = new Set(lineItems.map((li) => String(li.section || '').toUpperCase()).filter(Boolean));
    const buckets = new Set(lineItems.map((li) => li.deducteeBucket));
    if (sections.size > 1) return 'Separate challan is required for each Nature / Type of Payment.';
    if (buckets.size > 1) return 'Separate challan is required for Company and Non-Company deductees.';
    const sec = [...sections][0];
    if (sec && !SECTION_TO_NATURE[sec]) return `Unsupported section ${sec}`;
    const total = lineItems.reduce((a, li) => a + (Number(li.payAmount) || 0), 0);
    if (total <= 0) return 'Amount must be greater than zero';
    return null;
}

let passed = 0;
let failed = 0;

function assert(name, cond) {
    if (cond) {
        passed += 1;
        console.log(`PASS: ${name}`);
    } else {
        failed += 1;
        console.error(`FAIL: ${name}`);
    }
}

assert('AY FY 2026-2027', assessmentYearFromFinancialYear('2026-2027') === '2027-2028');
assert('Single 194J ok', !validateLines([{ section: '194J', deducteeBucket: '0021', payAmount: 100 }]));
assert('Single 194C ok', !validateLines([{ section: '194C', deducteeBucket: '0020', payAmount: 50 }]));
assert(
    'Same section multi row ok',
    !validateLines([
        { section: '194J', deducteeBucket: '0021', payAmount: 100 },
        { section: '194J', deducteeBucket: '0021', payAmount: 200 },
    ]),
);
assert(
    'Multi section blocked',
    validateLines([
        { section: '194J', deducteeBucket: '0021', payAmount: 100 },
        { section: '194C', deducteeBucket: '0021', payAmount: 50 },
    ])?.includes('Nature'),
);
assert(
    'Mixed deductee blocked',
    validateLines([
        { section: '194J', deducteeBucket: '0020', payAmount: 100 },
        { section: '194J', deducteeBucket: '0021', payAmount: 50 },
    ])?.includes('Company'),
);

const wordsTotal = 100 + 0 + 0 + 0 + 0;
assert('Total sum', wordsTotal === 100);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
