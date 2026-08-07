/**
 * Local GST date-resolution helpers for Master Alteration.
 * Kept inside this module so the MA commit does not depend on untracked GST-provider stacks.
 * Never uses "today" alone to reclassify historical invoices.
 */

function toDateOnly(d) {
    if (!d) return null;
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function statusCoversDate(row, transactionDate) {
    const tx = toDateOnly(transactionDate);
    if (!tx || !row) return false;
    const from = toDateOnly(row.effectiveFrom);
    const to = toDateOnly(row.effectiveTo);
    if (from && tx.getTime() < from.getTime()) return false;
    if (to && tx.getTime() > to.getTime()) return false;
    if (!from && !to) return false;
    return true;
}

/**
 * Resolve status applicable on a transaction date from history rows + current verification.
 */
export function resolveStatusOnDate({
    transactionDate,
    historyRows = [],
    currentStatus,
    cancellationDate,
    registrationDate,
    suspensionDate,
    revocationDate,
}) {
    const tx = toDateOnly(transactionDate);
    const sorted = [...(historyRows || [])]
        .filter((h) => h && (h.effectiveFrom || h.cancellationDate || h.registrationDate))
        .sort((a, b) => {
            const da = toDateOnly(a.effectiveFrom || a.registrationDate)?.getTime() || 0;
            const db = toDateOnly(b.effectiveFrom || b.registrationDate)?.getTime() || 0;
            return db - da;
        });

    for (const row of sorted) {
        if (statusCoversDate(row, transactionDate)) {
            return {
                statusOnTransactionDate: row.status,
                effectiveFrom: row.effectiveFrom || null,
                effectiveTo: row.effectiveTo || null,
                sourceHistoryId: row._id || null,
                resolutionReason: `History row status ${row.status} covers transaction date`,
            };
        }
    }

    const cancelD = toDateOnly(cancellationDate);
    const regD = toDateOnly(registrationDate);
    const susD = toDateOnly(suspensionDate);
    const revD = toDateOnly(revocationDate);

    if (revD && cancelD && tx) {
        if (tx.getTime() >= revD.getTime()) {
            return {
                statusOnTransactionDate: 'Active',
                effectiveFrom: revD,
                effectiveTo: null,
                sourceHistoryId: null,
                resolutionReason: 'GSTIN restored/revoked on or before transaction date',
            };
        }
        if (tx.getTime() >= cancelD.getTime() && tx.getTime() < revD.getTime()) {
            return {
                statusOnTransactionDate: 'Cancelled',
                effectiveFrom: cancelD,
                effectiveTo: revD,
                sourceHistoryId: null,
                resolutionReason: 'GSTIN cancelled before transaction and restored after',
            };
        }
    }

    if (susD && tx && String(currentStatus).toLowerCase() === 'suspended') {
        if (tx.getTime() >= susD.getTime()) {
            return {
                statusOnTransactionDate: 'Suspended',
                effectiveFrom: susD,
                effectiveTo: null,
                sourceHistoryId: null,
                resolutionReason: 'GSTIN suspended on or before transaction date',
            };
        }
    }

    if (cancelD && tx) {
        if (tx.getTime() >= cancelD.getTime()) {
            return {
                statusOnTransactionDate: 'Cancelled',
                effectiveFrom: cancelD,
                effectiveTo: null,
                sourceHistoryId: null,
                resolutionReason: 'Cancellation effective on or before transaction date',
            };
        }
        if (regD && tx.getTime() >= regD.getTime()) {
            return {
                statusOnTransactionDate: 'Active',
                effectiveFrom: regD,
                effectiveTo: new Date(cancelD.getTime() - 86400000),
                sourceHistoryId: null,
                resolutionReason: 'GSTIN was active on invoice date; cancellation is after invoice date',
            };
        }
        return {
            statusOnTransactionDate: 'Active',
            effectiveFrom: null,
            effectiveTo: cancelD,
            sourceHistoryId: null,
            resolutionReason: 'GSTIN was active on invoice date; cancellation is after invoice date',
        };
    }

    const norm = String(currentStatus || 'Unknown');
    if (
        [
            'Active',
            'Cancelled',
            'Suspended',
            'Inactive',
            'Not Found',
            'Invalid',
            'Unknown',
            'Verification Unavailable',
            'Revoked',
            'Restored',
        ].includes(norm)
    ) {
        if (norm === 'Cancelled' && !cancelD) {
            return {
                statusOnTransactionDate: 'Unknown',
                effectiveFrom: null,
                effectiveTo: null,
                sourceHistoryId: null,
                resolutionReason: 'Cancelled status without cancellation date — requires review',
            };
        }
        if (norm === 'Active' || (!cancelD && norm !== 'Cancelled')) {
            return {
                statusOnTransactionDate: norm === 'Active' ? 'Active' : norm,
                effectiveFrom: regD,
                effectiveTo: null,
                sourceHistoryId: null,
                resolutionReason: `Current status ${norm} used (no conflicting cancellation on/before invoice date)`,
            };
        }
    }

    return {
        statusOnTransactionDate: 'Unknown',
        effectiveFrom: null,
        effectiveTo: null,
        sourceHistoryId: null,
        resolutionReason: 'Unable to determine status on transaction date',
    };
}

/** Build invoice GST snapshot fields from a resolution object (no provider I/O). */
export function buildTransactionGstSnapshot(resolution, overrides = {}) {
    return {
        gstinUsed: overrides.gstinUsed ?? resolution.gstin ?? '',
        gstLegalNameSnapshot: overrides.gstLegalNameSnapshot ?? resolution.verification?.legalName ?? '',
        gstTradeNameSnapshot: overrides.gstTradeNameSnapshot ?? resolution.verification?.tradeName ?? '',
        gstStatusSnapshot: overrides.gstStatusSnapshot ?? resolution.currentPortalStatus ?? '',
        gstStatusOnTransactionDate:
            overrides.gstStatusOnTransactionDate ?? resolution.statusOnTransactionDate ?? '',
        gstRegistrationTypeSnapshot:
            overrides.gstRegistrationTypeSnapshot ?? resolution.verification?.registrationType ?? '',
        gstTreatmentSnapshot: overrides.gstTreatmentSnapshot ?? resolution.recommendedGSTTreatment ?? '',
        gstr1CategorySnapshot: overrides.gstr1CategorySnapshot ?? resolution.recommendedReturnCategory ?? '',
        cancellationDateSnapshot: overrides.cancellationDateSnapshot ?? resolution.cancellationDate ?? null,
        verificationDateSnapshot: overrides.verificationDateSnapshot ?? resolution.verification?.fetchedAt ?? null,
        verificationProviderSnapshot:
            overrides.verificationProviderSnapshot ?? resolution.verification?.providerName ?? '',
        gstHistoryId: overrides.gstHistoryId ?? resolution.sourceHistoryId ?? null,
        decisionReason: overrides.decisionReason ?? resolution.resolutionReason ?? '',
        manualOverride: Boolean(overrides.manualOverride),
        overrideReason: overrides.overrideReason || '',
        approvedBy: overrides.approvedBy || null,
        approvedAt: overrides.approvedAt || null,
    };
}
