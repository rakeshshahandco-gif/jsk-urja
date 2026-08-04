/**
 * Frontend mirror of backend ledgerClassification.utils — group-hierarchy based roles.
 * Used by Expense Voucher selectors so stale type/flags do not hide reclassified creditors.
 */

const CREDITOR_NAME_RE =
    /\b(sundry\s*creditors?|trade\s*creditors?|expense\s*creditors?|supplier\s*ledgers?|suppliers?|creditors?)\b/i;
const DEBTOR_NAME_RE = /\b(sundry\s*debtors?|trade\s*debtors?|debtors?|customers?)\b/i;
const EXPENSE_NAME_RE =
    /\b(direct\s*expenses?|indirect\s*expenses?|expenses?|purchase\s*accounts?|cost\s*of\s*goods)\b/i;
const CASH_NAME_RE = /\b(cash[\s-]*in[\s-]*hand|cash)\b/i;
const BANK_NAME_RE = /\b(bank\s*accounts?|bank)\b/i;
const TAX_NAME_RE = /\b(duties\s*&\s*taxes|duties and taxes|gst|tds\s*payable|tcs)\b/i;

export function buildGroupIndex(groups = []) {
    const byId = new Map();
    for (const g of groups) {
        if (g?._id) byId.set(String(g._id), g);
    }
    return byId;
}

export function getGroupAncestorNames(ledger, groupIndex) {
    const names = [];
    let id = ledger?.underGroup?._id || ledger?.underGroup;
    let guard = 0;
    while (id && guard++ < 16) {
        const g = groupIndex.get(String(id));
        if (!g) break;
        names.push(String(g.name || '').trim());
        id = g.parentGroup?._id || g.parentGroup || null;
    }
    if (!names.length && ledger?.groupName) names.push(String(ledger.groupName).trim());
    return names;
}

export function classifyLedgerRole(ledger, groupIndex) {
    if (!ledger) return 'general';
    if (ledger.isCashLedger || ledger.type === 'Cash') return 'cash';
    if (ledger.isBank || ledger.type === 'Bank') return 'bank';

    const names = getGroupAncestorNames(ledger, groupIndex);
    const nature =
        (() => {
            let id = ledger?.underGroup?._id || ledger?.underGroup;
            const g = id ? groupIndex.get(String(id)) : null;
            return g?.nature || '';
        })();

    const hit = (re) => names.some((n) => re.test(n));

    if (hit(CASH_NAME_RE) && nature === 'Assets') return 'cash';
    if (hit(BANK_NAME_RE) && nature === 'Assets') return 'bank';
    if ((hit(DEBTOR_NAME_RE) && nature === 'Assets') || ledger.isCustomer || ledger.type === 'Customer') {
        return 'debtor';
    }
    const leaf = names[0] || '';
    if (
        (hit(CREDITOR_NAME_RE) && nature === 'Liabilities' && !/\badvance\b/i.test(leaf))
        || ledger.isSupplier
        || ledger.type === 'Supplier'
    ) {
        return 'creditor';
    }
    if (hit(TAX_NAME_RE) || ledger.type === 'Tax') return 'tax';
    if (nature === 'Expenses' || hit(EXPENSE_NAME_RE) || ledger.type === 'Expense') return 'expense';
    if (nature === 'Income' || ledger.type === 'Income') return 'income';
    return 'general';
}

export function isCreditorLedger(ledger, groupIndex) {
    return classifyLedgerRole(ledger, groupIndex) === 'creditor';
}

export function isExpenseLedger(ledger, groupIndex) {
    return classifyLedgerRole(ledger, groupIndex) === 'expense';
}

/** Sundry Creditors / Debtors — party identity (PAN, GSTIN, constitution, MSME, LDC). */
export function isPartyLedger(ledger, groupIndex) {
    const role = classifyLedgerRole(ledger, groupIndex);
    return role === 'creditor' || role === 'debtor';
}

/**
 * Expense / Income / Sales / Purchase nature ledgers — transaction tax settings only.
 * Classification uses group hierarchy (not ledger name alone).
 */
export function isTransactionNatureLedger(ledger, groupIndex) {
    const role = classifyLedgerRole(ledger, groupIndex);
    return role === 'expense' || role === 'income';
}

export function isCashOrBankLedger(ledger, groupIndex) {
    const role = classifyLedgerRole(ledger, groupIndex);
    return role === 'cash' || role === 'bank';
}

export function isTaxLedger(ledger, groupIndex) {
    return classifyLedgerRole(ledger, groupIndex) === 'tax';
}

export function formatLedgerBalanceDrCr(balance) {
    const n = Number(balance) || 0;
    // Convention in this CRM: positive = Dr, negative = Cr
    return {
        abs: Math.abs(n),
        side: n >= 0 ? 'Dr' : 'Cr',
        color: n >= 0 ? '#10b981' : '#ef4444',
    };
}
