const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function certActiveOnDate(cert, date) {
    if (cert == null) return false;
    if (cert.active === false || cert.isActive === false) return false;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return false;
    const from = cert.validFrom ? new Date(cert.validFrom) : null;
    const to = cert.validTo ? new Date(cert.validTo) : null;
    if (from && d < from) return false;
    if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
    }
    return Number(cert.rate) > 0;
}

/**
 * Resolve lower deduction rate for section on payment date.
 * Prefers matching certificate row; falls back to legacy flat tdsLowerDeductionPercent when in validity window.
 */
export function resolveLowerDeductionRate({ section, paymentDate, certificates = [], legacyPercent = 0, legacyValidFrom, legacyValidTo }) {
    const sec = String(section || '').trim().toUpperCase();
    if (!sec) return null;

    const d = paymentDate ? new Date(paymentDate) : new Date();
    const list = Array.isArray(certificates) ? certificates : [];

    for (const c of list) {
        if (String(c.section || '').trim().toUpperCase() !== sec) continue;
        if (!certActiveOnDate(c, d)) continue;
        return r2(Number(c.rate));
    }

    const pct = Number(legacyPercent) || 0;
    if (!(pct > 0)) return null;

    const from = legacyValidFrom ? new Date(legacyValidFrom) : null;
    const to = legacyValidTo ? new Date(legacyValidTo) : null;
    if (from && d < from) return null;
    if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (d > end) return null;
    }
    return r2(pct);
}

export function listActiveLowerDeductionCertificates(certificates = [], asOfDate = new Date()) {
    const d = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
    return (Array.isArray(certificates) ? certificates : []).filter((c) => certActiveOnDate(c, d));
}
