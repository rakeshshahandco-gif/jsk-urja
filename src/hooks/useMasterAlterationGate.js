import { useState, useCallback } from 'react';

const SENSITIVE = {
    Customer: [
        'gstNumber',
        'gstRegistrationType',
        'gstStatus',
        'gstRegistrationEffectiveDate',
        'gstCancellationEffectiveDate',
        'state',
        'billingStateCode',
        'gstState',
        'panNumber',
        'customerName',
        'company',
    ],
    Supplier: [
        'supplierName',
        'gstNumber',
        'gstRegistrationStatus',
        'gstRegistrationEffectiveDate',
        'gstCancellationEffectiveDate',
        'state',
        'panNumber',
    ],
    Ledger: ['name', 'underGroup', 'groupName'],
    Item: ['name', 'itemName', 'hsnCode', 'hsnSacId'],
};

/**
 * Detect sensitive Master field changes and stage Impact Preview instead of direct save.
 */
export function useMasterAlterationGate(masterType) {
    const [pending, setPending] = useState(null);

    const detectProposed = useCallback(
        (existing, nextPayload) => {
            if (!existing?._id) return {};
            const fields = SENSITIVE[masterType] || [];
            const proposed = {};
            for (const f of fields) {
                if (nextPayload[f] === undefined) continue;
                const a = existing[f]?._id || existing[f];
                const b = nextPayload[f]?._id || nextPayload[f];
                if (String(a ?? '') !== String(b ?? '')) proposed[f] = nextPayload[f]?._id || nextPayload[f];
            }
            return proposed;
        },
        [masterType],
    );

    /**
     * @returns {boolean} true if caller should abort normal save (preview opened)
     */
    const gateSensitiveSave = useCallback(
        (existing, nextPayload) => {
            const proposedChanges = detectProposed(existing, nextPayload);
            if (!Object.keys(proposedChanges).length) return false;
            setPending({ payload: nextPayload, proposedChanges, masterId: existing._id });
            return true;
        },
        [detectProposed],
    );

    const clearPending = useCallback(() => setPending(null), []);

    return { pending, setPending, clearPending, gateSensitiveSave, detectProposed };
}

export default useMasterAlterationGate;
