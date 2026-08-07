/**
 * Bounded embedded ledger group history (no new collection).
 * Max 20 rows; oldest dropped after seed retention of first historical row.
 */

const MAX_GROUP_HISTORY = 20;

export function toDateOnly(d) {
    if (!d) return null;
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

export function dayBefore(d) {
    const x = toDateOnly(d);
    if (!x) return null;
    return new Date(x.getTime() - 86400000);
}

/**
 * Resolve which group applies on asOfDate from embedded history + current underGroup.
 */
export function resolveLedgerGroupAtDate(ledger, asOfDate) {
    const asOf = toDateOnly(asOfDate) || toDateOnly(new Date());
    const history = Array.isArray(ledger?.groupHistory) ? ledger.groupHistory : [];

    const covering = history
        .filter((h) => h && h.groupId)
        .map((h) => ({
            ...h,
            _from: toDateOnly(h.effectiveFrom),
            _to: toDateOnly(h.effectiveTo),
        }))
        .filter((h) => {
            if (h._from && asOf.getTime() < h._from.getTime()) return false;
            if (h._to && asOf.getTime() > h._to.getTime()) return false;
            return true;
        })
        .sort((a, b) => {
            const da = a._from?.getTime() || 0;
            const db = b._from?.getTime() || 0;
            return db - da;
        });

    if (covering.length) {
        const h = covering[0];
        return {
            groupId: h.groupId,
            groupName: h.groupNameSnapshot || '',
            source: 'groupHistory',
            effectiveFrom: h.effectiveFrom || null,
            effectiveTo: h.effectiveTo || null,
        };
    }

    return {
        groupId: ledger?.underGroup || null,
        groupName: ledger?.groupName || '',
        source: 'current',
        effectiveFrom: null,
        effectiveTo: null,
    };
}

/**
 * Build next groupHistory array for a prospective group change.
 * Seeds prior classification if history empty so locked periods stay protected.
 */
export function buildNextGroupHistory({
    ledger,
    newGroupId,
    newGroupName,
    effectiveFrom,
    changedBy,
    reason,
}) {
    const from = toDateOnly(effectiveFrom) || toDateOnly(new Date());
    let history = Array.isArray(ledger.groupHistory) ? [...ledger.groupHistory] : [];

    if (!history.length && ledger.underGroup) {
        history.push({
            groupId: ledger.underGroup,
            groupNameSnapshot: ledger.groupName || '',
            effectiveFrom: null,
            effectiveTo: dayBefore(from),
            changedBy: changedBy || null,
            changedAt: new Date(),
            reason: reason || 'Seeded prior classification before group alteration',
        });
    } else {
        history = history.map((h) => {
            const openEnded = !h.effectiveTo;
            const coversFrom = !h.effectiveFrom || toDateOnly(h.effectiveFrom)?.getTime() <= from.getTime();
            if (openEnded && coversFrom) {
                return { ...h, effectiveTo: dayBefore(from) };
            }
            return h;
        });
    }

    history.push({
        groupId: newGroupId,
        groupNameSnapshot: newGroupName || '',
        effectiveFrom: from,
        effectiveTo: null,
        changedBy: changedBy || null,
        changedAt: new Date(),
        reason: reason || '',
    });

    // Bound: keep first seed + newest (MAX-1)
    if (history.length > MAX_GROUP_HISTORY) {
        const seed = history[0];
        const rest = history.slice(1).slice(-(MAX_GROUP_HISTORY - 1));
        history = [seed, ...rest];
    }

    return history;
}
