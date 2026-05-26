/**
 * Pure GST 2A/2B matching helpers (no DB).
 */

export const DEFAULT_GST_MATCH_CONFIG = {
    taxTolerance: 2,
    taxableTolerance: 2,
    dateToleranceDays: 7,
};

export function normalizeInvoiceRef(ref) {
    return String(ref || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

export function getMonthDateRange(financialYear, month) {
    const m = String(month).padStart(2, '0');
    const parts = String(financialYear).split('-');
    const startYear = parseInt(parts[0], 10);
    const monthNum = parseInt(m, 10);
    const calYear = monthNum >= 4 ? startYear : startYear + 1;
    const startDate = new Date(calYear, monthNum - 1, 1);
    const endDate = new Date(calYear, monthNum, 0, 23, 59, 59, 999);
    return { startDate, endDate };
}

export function amountsWithinTolerance(a, b, tolerance) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= (tolerance ?? 0);
}

export function daysBetween(a, b) {
    if (!a || !b) return null;
    const d1 = new Date(a);
    const d2 = new Date(b);
    return Math.abs(Math.round((d1 - d2) / (24 * 60 * 60 * 1000)));
}

/**
 * Score 0–100 for books vs portal invoice pair.
 */
export function scoreGstPair(books, portal, config = DEFAULT_GST_MATCH_CONFIG) {
    if (!books || !portal) return { score: 0, reasons: ['missing_side'] };
    if (books.supplierGstin !== portal.supplierGstin) {
        return { score: 0, reasons: ['gstin_mismatch'] };
    }

    const bNum = normalizeInvoiceRef(books.billNo || books.supplierInvoiceNo || books.invoiceNumber);
    const pNum = normalizeInvoiceRef(portal.billNo || portal.invoiceNumber);
    if (!bNum || !pNum || bNum !== pNum) {
        return { score: 0, reasons: ['invoice_number_mismatch'] };
    }

    const days = daysBetween(books.billDate || books.invoiceDate, portal.billDate || portal.invoiceDate);
    if (days != null && days > config.dateToleranceDays) {
        return { score: 40, reasons: ['date_outside_tolerance'], days };
    }

    const taxOk = amountsWithinTolerance(books.totalGst, portal.totalGst, config.taxTolerance);
    const taxableOk = amountsWithinTolerance(
        books.taxableValue ?? books.totalTaxableAmount,
        portal.taxableValue,
        config.taxableTolerance,
    );

    let score = 70;
    const reasons = ['invoice_ref_match'];
    if (taxOk && taxableOk) {
        score = days === 0 ? 100 : 92;
        reasons.push('amount_match');
    } else if (taxOk || taxableOk) {
        score = 75;
        reasons.push('partial_amount_match');
    } else {
        score = 55;
        reasons.push('amount_mismatch');
    }

    return {
        score,
        reasons,
        days: days ?? 0,
        taxDifference: (Number(books.totalGst) || 0) - (Number(portal.totalGst) || 0),
        taxableDifference:
            (Number(books.taxableValue ?? books.totalTaxableAmount) || 0) - (Number(portal.taxableValue) || 0),
    };
}

export function classifyGstMatchStatus(books, portal, config = DEFAULT_GST_MATCH_CONFIG) {
    if (!books && portal) return '2B Only';
    if (books && !portal) return 'Books Only';

    const { score, reasons } = scoreGstPair(
        {
            supplierGstin: books.supplierGstin,
            billNo: books.supplierInvoiceNo,
            billDate: books.invoiceDate,
            taxableValue: books.totalTaxableAmount,
            totalGst: books.totalTax,
        },
        {
            supplierGstin: portal.supplierGstin,
            invoiceNumber: portal.invoiceNumber,
            invoiceDate: portal.invoiceDate,
            taxableValue: portal.taxableValue,
            totalGst: portal.totalTax,
        },
        config,
    );

    if (reasons.includes('invoice_number_mismatch') || reasons.includes('gstin_mismatch')) {
        return 'Mismatch';
    }
    if (score >= 90) return 'Fully Matched';
    if (score >= 70) return 'Matched with Rounding';
    return 'Mismatch';
}

export function isRcmRecord(rec) {
    return Boolean(
        rec?.reverseCharge ||
        rec?.isReverseCharge ||
        String(rec?.invoiceType || '').toUpperCase() === 'RCM' ||
        String(rec?.supplyType || '').toLowerCase().includes('reverse'),
    );
}
