/** Supplier / vendor deductee constitution — drives Individual/HUF vs Others rate from TDS Master. */
export const DEDUCTEE_CONSTITUTION = [
    'Individual',
    'HUF',
    'Partnership Firm',
    'LLP',
    'Private Limited Company',
    'Public Limited Company',
    'Proprietorship',
    'Trust',
    'Society',
    'Others',
];

/** Maps to TDS Master rateIndividualHuf — Individual, HUF, Proprietorship. */
export function isIndividualHufConstitution(constitution) {
    const c = String(constitution || '').trim();
    return c === 'Individual' || c === 'HUF' || c === 'Proprietorship';
}

/** Legacy ledger/supplier tdsDeductorType → approximate constitution for migration. */
export function constitutionFromLegacyDeductorType(t) {
    const x = String(t || '').trim();
    if (x === 'Individual') return 'Individual';
    if (x === 'HUF') return 'HUF';
    return '';
}

export const PAN_ABSENT_DEFAULT_RATE = 20;

/** Income-tax TDS sections supported for compliance rows (extend as needed). */
export const TDS_SECTIONS = [
    '194C',
    '194J',
    '194H',
    '194I',
    '194IB',
    '194A',
    '194Q',
    '194M',
    '194R',
    '194DA',
    '194S',
    '194D',
    '194G',
    '194LA',
    '194O',
    '195',
    'OTHER',
];

/**
 * F.Y. 2026-27 indicative defaults — fully editable from TDS Master admin UI.
 * thresholdAmount = yearly aggregate; singleBillThreshold = per-payment limit.
 */
export const TDS_MASTER_DEFAULTS = [
    {
        sectionCode: '194C',
        sectionName: 'Contractor / Labour / Manpower Supply',
        description: 'Labour, fabrication, job work, manpower, security, transport contract',
        rateIndividualHuf: 1,
        rateOthers: 2,
        defaultRate: 1,
        singleBillThreshold: 30000,
        thresholdAmount: 100000,
        thresholdCalculationMethod: 'Both',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Contract',
        panMandatory: true,
    },
    {
        sectionCode: '194J',
        sectionName: 'Professional Fees',
        description: 'Professional fees; technical services @ 2%',
        rateIndividualHuf: 10,
        rateOthers: 10,
        rateTechnicalServices: 2,
        defaultRate: 10,
        singleBillThreshold: 30000,
        thresholdAmount: 30000,
        thresholdCalculationMethod: 'Both',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Professional',
        panMandatory: true,
    },
    {
        sectionCode: '194I',
        sectionName: 'Rent',
        description: 'Plant & machinery 2%; land/building/furniture 10%',
        rateIndividualHuf: 10,
        rateOthers: 10,
        defaultRate: 10,
        singleBillThreshold: 0,
        thresholdAmount: 600000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Rent',
    },
    {
        sectionCode: '194H',
        sectionName: 'Commission / Brokerage',
        rateIndividualHuf: 5,
        rateOthers: 5,
        defaultRate: 5,
        singleBillThreshold: 0,
        thresholdAmount: 20000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Commission',
    },
    {
        sectionCode: '194A',
        sectionName: 'Interest (other than securities)',
        rateIndividualHuf: 10,
        rateOthers: 10,
        defaultRate: 10,
        singleBillThreshold: 0,
        thresholdAmount: 50000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Interest',
    },
    {
        sectionCode: '194Q',
        sectionName: 'Purchase of Goods',
        rateIndividualHuf: 0.1,
        rateOthers: 0.1,
        defaultRate: 0.1,
        singleBillThreshold: 0,
        thresholdAmount: 5000000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Purchase',
    },
    {
        sectionCode: '194IB',
        sectionName: 'Rent by Individual/HUF (not covered u/s 194I)',
        rateIndividualHuf: 5,
        rateOthers: 5,
        defaultRate: 5,
        singleBillThreshold: 0,
        thresholdAmount: 600000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Rent',
    },
    {
        sectionCode: '194M',
        sectionName: 'Contract/Professional by Individual',
        rateIndividualHuf: 5,
        rateOthers: 5,
        defaultRate: 5,
        singleBillThreshold: 0,
        thresholdAmount: 5000000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Contract',
    },
    {
        sectionCode: '194DA',
        sectionName: 'Insurance Commission',
        rateIndividualHuf: 5,
        rateOthers: 5,
        defaultRate: 5,
        singleBillThreshold: 0,
        thresholdAmount: 15000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Commission',
    },
    {
        sectionCode: '194R',
        sectionName: 'Benefit / Perquisite',
        rateIndividualHuf: 10,
        rateOthers: 10,
        defaultRate: 10,
        singleBillThreshold: 0,
        thresholdAmount: 20000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Perquisite',
    },
    {
        sectionCode: '194S',
        sectionName: 'Crypto / VDA',
        rateIndividualHuf: 1,
        rateOthers: 1,
        defaultRate: 1,
        singleBillThreshold: 0,
        thresholdAmount: 0,
        thresholdCalculationMethod: 'SingleBill',
        calculationType: 'PerTransaction',
        natureOfPayment: 'VDA',
    },
    {
        sectionCode: '194O',
        sectionName: 'E-commerce participants',
        rateIndividualHuf: 1,
        rateOthers: 1,
        defaultRate: 1,
        singleBillThreshold: 0,
        thresholdAmount: 500000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'E-commerce',
    },
    {
        sectionCode: '195',
        sectionName: 'Non-resident payments',
        rateIndividualHuf: 10,
        rateOthers: 10,
        defaultRate: 10,
        singleBillThreshold: 0,
        thresholdAmount: 0,
        thresholdCalculationMethod: 'SingleBill',
        calculationType: 'PerTransaction',
        natureOfPayment: 'Non-resident',
    },
];

/**
 * Heuristic default section from ledger name when master data is missing (for clear user messages only).
 */
export function suggestTdsSectionFromLedgerName(ledgerName) {
    const n = String(ledgerName || '').toUpperCase();
    if (!n.trim()) return null;
    if (/(PROFESSIONAL|PROF\.|PROF\s|CONSULT|TECHNICAL|LEGAL\s*&\s*PROF|AUDIT|ADVOCATE)/.test(n)) return '194J';
    if (/(LABOUR|LABOR|CONTRACT|SUB[-\s]?CONTRACT|WORK\s*ORDER|MANPOWER|SECURITY|JOB\s*WORK|FABRICATION)/.test(n))
        return '194C';
    if (/(RENT|LEASE)/.test(n)) return '194I';
    if (/(COMMISSION|BROKER)/.test(n)) return '194H';
    return null;
}

/** Default section-wise TDS payable liability ledger name (user can rename; posting uses ledgerId). */
export function suggestedTdsPayableLedgerName(sectionCode, sectionNameFromMaster) {
    const c = String(sectionCode || '').trim().toUpperCase();
    const preset = {
        '194C': 'TDS - Contract 194C',
        '194J': 'TDS - Professional Fees 194J',
        '194H': 'TDS - Commission 194H',
        '194I': 'TDS - Rent 194I',
        '194A': 'TDS - Interest 194A',
        '194Q': 'TDS - Purchase of Goods 194Q',
        '194R': 'TDS - Benefit or Perquisite 194R',
    };
    if (preset[c]) return preset[c];
    const sn = String(sectionNameFromMaster || '').trim();
    if (sn) return `TDS - ${sn} ${c}`;
    return `TDS - Section ${c}`;
}

export const TDS_RETURN_TYPES = ['24Q', '26Q', '27Q'];
export const TDS_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function normalizePan(pan) {
    if (pan == null || typeof pan !== 'string') return '';
    return pan.trim().toUpperCase();
}

export function isValidPan(pan) {
    return PAN_RE.test(normalizePan(pan));
}

export function parseFinancialYearRange(financialYear) {
    const m = String(financialYear || '').match(/^(\d{4})-(\d{4})$/);
    if (!m) return null;
    const y1 = parseInt(m[1], 10);
    const y2 = parseInt(m[2], 10);
    if (y2 !== y1 + 1) return null;
    return {
        start: new Date(y1, 3, 1),
        end: new Date(y2, 2, 31, 23, 59, 59, 999),
        startYear: y1,
    };
}

/**
 * Income-tax Assessment Year for a given Indian Financial Year (canonical "YYYY-YYYY").
 * Example: FY 2026-2027 → AY 2027-2028.
 */
export function assessmentYearFromFinancialYear(financialYear) {
    const range = parseFinancialYearRange(String(financialYear || '').trim());
    if (!range) return '';
    const ay1 = range.startYear + 1;
    const ay2 = range.startYear + 2;
    return `${ay1}-${ay2}`;
}

export function quarterForDateInFY(date, financialYear) {
    const range = parseFinancialYearRange(financialYear);
    if (!range) return null;
    const d = new Date(date);
    const month = d.getMonth();
    const y = d.getFullYear();
    const fyStart = range.startYear;

    if (y === fyStart && month >= 3 && month <= 5) return 'Q1';
    if (y === fyStart && month >= 6 && month <= 8) return 'Q2';
    if (y === fyStart && month >= 9 && month <= 11) return 'Q3';
    if (y === fyStart + 1 && month >= 0 && month <= 2) return 'Q4';
    return null;
}
