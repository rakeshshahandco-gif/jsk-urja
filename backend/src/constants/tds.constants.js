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
        description: 'Labour, fabrication, job work, manpower, security, transport, courier contract',
        rateIndividualHuf: 1,
        rateOthers: 2,
        defaultRate: 1,
        singleBillThreshold: 30000,
        thresholdAmount: 100000,
        thresholdCalculationMethod: 'Both',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Contractor',
        tdsNature: 'Contractor',
        section393TableItem: '6(i)',
        section393Label: 'Section 393(1), Table Sl. No. 6(i)',
        panMandatory: true,
    },
    {
        sectionCode: '194J',
        sectionName: 'Professional / Technical Fees',
        description: 'Professional fees @ 10%; technical services @ 2% (select nature on expense ledger)',
        rateIndividualHuf: 10,
        rateOthers: 10,
        rateTechnicalServices: 2,
        defaultRate: 10,
        singleBillThreshold: 0,
        thresholdAmount: 50000,
        thresholdCalculationMethod: 'AggregateFY',
        calculationType: 'YearlyCumulative',
        natureOfPayment: 'Professional Services',
        tdsNature: 'Professional Services',
        section393TableItem: '6(iii)',
        section393Label: 'Section 393(1), Table Sl. No. 6(iii)',
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
    if (/TECHNICAL/.test(n)) return '194J';
    if (/(PROFESSIONAL|PROF\.|PROF\s|CONSULT|LEGAL\s*&\s*PROF|AUDIT|ADVOCATE|DESIGN\s*FEE)/.test(n)) return '194J';
    if (/(COURIER|FREIGHT|TRANSPORT|LABOUR|LABOR|CONTRACT|SUB[-\s]?CONTRACT|WORK\s*ORDER|MANPOWER|SECURITY|JOB\s*WORK|FABRICATION|INSTALL)/.test(n))
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

/**
 * Payment natures — expense line decides why; supplier constitution decides rate where needed.
 * Same supplier may use several natures in one FY (separate threshold buckets).
 */
export const TDS_NATURES = [
    'Contractor',
    'Professional Services',
    'Technical Services',
    'Rent',
    'Commission',
    'Interest',
    'Purchase of Goods',
    'Other',
];

/**
 * FY 2026-27+ display: keep legacy 194* labels for users, quote Income-tax Act, 2025 s.393 table items for returns.
 * Rates/thresholds remain in TdsMasterSection (editable).
 */
export const TDS_SECTION_393_MAP = {
    '194C': {
        tableItem: '6(i)',
        actLabel: 'Section 393(1), Table Sl. No. 6(i)',
        defaultNature: 'Contractor',
        display: '194C / 393-6(i)',
    },
    '194J': {
        tableItem: '6(iii)',
        actLabel: 'Section 393(1), Table Sl. No. 6(iii)',
        defaultNature: 'Professional Services',
        display: '194J / 393-6(iii)',
    },
    '194I': {
        tableItem: '6(iv)',
        actLabel: 'Section 393(1), Table Sl. No. 6(iv)',
        defaultNature: 'Rent',
        display: '194I / 393-6(iv)',
    },
    '194H': {
        tableItem: '6(ii)',
        actLabel: 'Section 393(1), Table Sl. No. 6(ii)',
        defaultNature: 'Commission',
        display: '194H / 393-6(ii)',
    },
    '194A': {
        tableItem: '5',
        actLabel: 'Section 393(1), Table (interest)',
        defaultNature: 'Interest',
        display: '194A / 393',
    },
};

export function normalizeTdsNatureKey(nature) {
    const n = String(nature || '').trim().toLowerCase();
    if (!n) return '';
    if (/technical/.test(n)) return 'TECHNICAL';
    if (/professional|consultancy|consult/.test(n)) return 'PROFESSIONAL';
    if (/contract|courier|labour|labor|job\s*work|manpower|freight|transport/.test(n)) return 'CONTRACTOR';
    if (/rent|lease/.test(n)) return 'RENT';
    if (/commission|broker/.test(n)) return 'COMMISSION';
    if (/interest/.test(n)) return 'INTEREST';
    if (/purchase|goods|194q/.test(n)) return 'PURCHASE';
    return String(nature || '').trim().toUpperCase().replace(/\s+/g, '_').slice(0, 40);
}

export function defaultNatureForSection(sectionCode) {
    const c = String(sectionCode || '').trim().toUpperCase();
    return TDS_SECTION_393_MAP[c]?.defaultNature || '';
}

export function formatTdsSectionDisplay(sectionCode, nature = '') {
    const c = String(sectionCode || '').trim().toUpperCase();
    const map = TDS_SECTION_393_MAP[c];
    const base = map?.display || c;
    const nat = String(nature || '').trim();
    if (nat && /technical/i.test(nat) && c === '194J') return `${base} (Technical 2%)`;
    return base;
}

export function suggestTdsNatureFromLedgerName(ledgerName) {
    const n = String(ledgerName || '').toUpperCase();
    if (!n.trim()) return '';
    if (/TECHNICAL/.test(n)) return 'Technical Services';
    if (/(PROFESSIONAL|PROF\.|CONSULT|LEGAL|AUDIT|ADVOCATE|DESIGN\s*FEE)/.test(n)) return 'Professional Services';
    if (/(COURIER|FREIGHT|TRANSPORT|LABOUR|LABOR|CONTRACT|SUB[-\s]?CONTRACT|MANPOWER|SECURITY|JOB\s*WORK|FABRICATION|INSTALL)/.test(n))
        return 'Contractor';
    if (/(RENT|LEASE)/.test(n)) return 'Rent';
    if (/(COMMISSION|BROKER)/.test(n)) return 'Commission';
    if (/INTEREST/.test(n)) return 'Interest';
    return '';
}

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
