export function isLedgerOnlyPurchase(draft) {
    return draft?.moduleType === 'purchase_invoice'
        && String(draft?.extractedData?.postingMode || 'with_inventory') === 'ledger_only';
}

export function normalizePostingMode(value) {
    return value === 'ledger_only' ? 'ledger_only' : 'with_inventory';
}
