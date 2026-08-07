/**
 * Date-effective GST registration resolution from embedded Master history.
 * No new collections.
 */
import { toDateOnly } from './ledgerGroupHistory.js';

const MAX_HIST = 20;

export function historyCoversDate(row, txDate) {
    const tx = toDateOnly(txDate);
    if (!tx || !row) return false;
    const from = toDateOnly(row.effectiveFrom);
    const to = toDateOnly(row.effectiveTo || row.cancellationDate);
    if (from && tx.getTime() < from.getTime()) return false;
    if (to && tx.getTime() > to.getTime()) return false;
    // Row with no from/to does not cover unless it's the only fallback
    if (!from && !to) return false;
    return true;
}

/**
 * Resolve GSTIN/status applicable on transactionDate from embedded history + current fields.
 */
export function resolveEmbeddedGstOnDate(master, transactionDate) {
    const history = Array.isArray(master?.gstRegistrationHistory) ? master.gstRegistrationHistory : [];
    const tx = toDateOnly(transactionDate);

    const covering = [...history]
        .filter((h) => h && (h.gstin || h.status || h.registrationType || h.registrationStatus))
        .map((h) => ({ ...h, _from: toDateOnly(h.effectiveFrom), _to: toDateOnly(h.effectiveTo || h.cancellationDate) }))
        .filter((h) => historyCoversDate(h, transactionDate))
        .sort((a, b) => (b._from?.getTime() || 0) - (a._from?.getTime() || 0));

    if (covering.length) {
        const h = covering[0];
        const cancelled =
            String(h.status || '').toLowerCase() === 'cancelled' ||
            (h.cancellationDate && toDateOnly(h.cancellationDate) && tx && tx >= toDateOnly(h.cancellationDate));
        return {
            gstin: cancelled ? '' : String(h.gstin || '').toUpperCase(),
            registrationType: h.registrationType || h.registrationStatus || '',
            status: cancelled ? 'Cancelled' : h.status || 'Active',
            effectiveFrom: h.effectiveFrom || null,
            effectiveTo: h.effectiveTo || null,
            source: 'embeddedHistory',
        };
    }

    // Fallback: current master fields with cancel/effective dates
    const cancelD = toDateOnly(master?.gstCancellationEffectiveDate);
    const regD = toDateOnly(master?.gstRegistrationEffectiveDate);
    const gstin = String(master?.gstNumber || '').trim().toUpperCase();
    const regType =
        master?.gstRegistrationType || master?.gstRegistrationStatus || '';

    if (cancelD && tx && tx.getTime() >= cancelD.getTime()) {
        return {
            gstin: '',
            registrationType: 'Unregistered',
            status: 'Cancelled',
            effectiveFrom: cancelD,
            effectiveTo: null,
            source: 'currentCancelled',
        };
    }
    if (regD && tx && tx.getTime() < regD.getTime()) {
        return {
            gstin: '',
            registrationType: 'Unregistered',
            status: 'NotYetEffective',
            effectiveFrom: null,
            effectiveTo: dayBeforeLocal(regD),
            source: 'currentNotYetEffective',
        };
    }

    return {
        gstin,
        registrationType: regType || (gstin.length >= 15 ? 'Registered' : 'Unregistered'),
        status: master?.gstStatus || (gstin ? 'Active' : 'Unknown'),
        effectiveFrom: regD,
        effectiveTo: cancelD ? dayBeforeLocal(cancelD) : null,
        source: 'currentMaster',
    };
}

function dayBeforeLocal(d) {
    const x = toDateOnly(d);
    if (!x) return null;
    return new Date(x.getTime() - 86400000);
}

/**
 * Push a history row only when GST-sensitive values actually change. Bounded to MAX_HIST.
 * Closes previous open-ended row (effectiveTo = day before new effectiveFrom).
 */
export function appendGstHistoryIfChanged(masterDoc, {
    nextGstin,
    nextRegistrationType,
    nextStatus,
    nextEffectiveFrom,
    nextCancellationDate,
    nextStateCode,
    userId,
    reason,
}) {
    const prevGstin = String(masterDoc.gstNumber || '').trim().toUpperCase();
    const nextG = String(nextGstin ?? masterDoc.gstNumber ?? '').trim().toUpperCase();
    const prevType = String(masterDoc.gstRegistrationType || masterDoc.gstRegistrationStatus || '');
    const nextType = String(nextRegistrationType ?? prevType);
    const prevStatus = String(masterDoc.gstStatus || '');
    const nextSt = String(nextStatus ?? prevStatus);
    const prevFrom = masterDoc.gstRegistrationEffectiveDate
        ? new Date(masterDoc.gstRegistrationEffectiveDate).toISOString().slice(0, 10)
        : '';
    const nextFromRaw = nextEffectiveFrom ?? masterDoc.gstRegistrationEffectiveDate;
    const nextFrom = nextFromRaw ? new Date(nextFromRaw).toISOString().slice(0, 10) : '';
    const prevCancel = masterDoc.gstCancellationEffectiveDate
        ? new Date(masterDoc.gstCancellationEffectiveDate).toISOString().slice(0, 10)
        : '';
    const nextCancelRaw = nextCancellationDate ?? masterDoc.gstCancellationEffectiveDate;
    const nextCancel = nextCancelRaw ? new Date(nextCancelRaw).toISOString().slice(0, 10) : '';

    const changed =
        prevGstin !== nextG ||
        prevType !== nextType ||
        prevStatus !== nextSt ||
        prevFrom !== nextFrom ||
        prevCancel !== nextCancel;

    if (!changed) return false;

    const hist = Array.isArray(masterDoc.gstRegistrationHistory)
        ? [...masterDoc.gstRegistrationHistory]
        : [];

    const effFrom = nextFromRaw ? new Date(nextFromRaw) : new Date();

    // Same GSTIN with later effectiveFrom = correction of validity start (not a new registration).
    // Do NOT leave a prior period with the same GSTIN covering earlier invoice dates.
    const plainHist = hist.map((h) =>
        h && typeof h.toObject === 'function' ? h.toObject() : { ...(h || {}) },
    );
    const sameGstinLaterFrom =
        prevGstin &&
        prevGstin === nextG &&
        nextFrom &&
        ((prevFrom && nextFrom > prevFrom) ||
            plainHist.some((h) => {
                if (String(h.gstin || '').toUpperCase() !== nextG) return false;
                const hf = toDateOnly(h.effectiveFrom);
                return hf && hf.getTime() < effFrom.getTime();
            }));

    if (sameGstinLaterFrom) {
        // Drop same-GSTIN rows that start before the corrected effectiveFrom
        const filtered = plainHist.filter((h) => {
            if (String(h.gstin || '').toUpperCase() !== nextG) return true;
            const hf = toDateOnly(h.effectiveFrom);
            if (hf && hf.getTime() < effFrom.getTime()) return false;
            if (!hf) return false; // open-ended same GSTIN without from — replace
            return true;
        });
        filtered.push({
            gstin: nextG,
            registrationType: nextType,
            registrationStatus: nextType,
            status: nextSt || (nextCancel ? 'Cancelled' : 'Active'),
            effectiveFrom: effFrom,
            effectiveTo: nextCancelRaw ? new Date(nextCancelRaw) : null,
            cancellationDate: nextCancelRaw ? new Date(nextCancelRaw) : null,
            stateCode: nextStateCode || masterDoc.billingStateCode || masterDoc.state || '',
            verificationProvider: 'MasterAlteration',
            verificationDate: new Date(),
            changedBy: userId || null,
            changedAt: new Date(),
            reason: reason || 'Corrected GST effective-from date',
        });
        while (filtered.length > MAX_HIST) filtered.shift();
        masterDoc.gstRegistrationHistory = filtered;
        return true;
    }

    // Close last open row
    if (plainHist.length) {
        const last = { ...plainHist[plainHist.length - 1] };
        if (!last.effectiveTo) {
            last.effectiveTo = dayBeforeLocal(effFrom);
            plainHist[plainHist.length - 1] = last;
        }
    } else if (prevGstin || prevType || prevStatus) {
        // Seed prior active period ending day before new effectiveFrom
        plainHist.push({
            gstin: prevGstin,
            registrationType: prevType,
            registrationStatus: prevType,
            status: prevStatus || (prevGstin ? 'Active' : 'Unregistered'),
            effectiveFrom: masterDoc.gstRegistrationEffectiveDate || null,
            effectiveTo: dayBeforeLocal(effFrom),
            cancellationDate: masterDoc.gstCancellationEffectiveDate || null,
            stateCode: masterDoc.billingStateCode || '',
            changedBy: userId || null,
            changedAt: new Date(),
            reason: 'Seeded prior GST period before alteration',
        });
    }

    plainHist.push({
        gstin: nextG,
        registrationType: nextType,
        registrationStatus: nextType,
        status: nextSt || (nextCancel ? 'Cancelled' : nextG ? 'Active' : 'Unregistered'),
        effectiveFrom: effFrom,
        effectiveTo: nextCancelRaw ? new Date(nextCancelRaw) : null,
        cancellationDate: nextCancelRaw ? new Date(nextCancelRaw) : null,
        stateCode: nextStateCode || masterDoc.billingStateCode || masterDoc.state || '',
        verificationProvider: 'MasterAlteration',
        verificationDate: new Date(),
        changedBy: userId || null,
        changedAt: new Date(),
        reason: reason || '',
    });

    while (plainHist.length > MAX_HIST) plainHist.shift();
    masterDoc.gstRegistrationHistory = plainHist;
    return true;
}
