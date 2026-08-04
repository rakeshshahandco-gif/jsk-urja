import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';

const CREDITOR_NAME_RE =
    /\b(sundry\s*creditors?|trade\s*creditors?|expense\s*creditors?|supplier\s*ledgers?|suppliers?|creditors?)\b/i;
const DEBTOR_NAME_RE = /\b(sundry\s*debtors?|trade\s*debtors?|debtors?|customers?)\b/i;
const EXPENSE_NAME_RE =
    /\b(direct\s*expenses?|indirect\s*expenses?|expenses?|purchase\s*accounts?|cost\s*of\s*goods)\b/i;
const CASH_NAME_RE = /\b(cash[\s-]*in[\s-]*hand|cash)\b/i;
const BANK_NAME_RE = /\b(bank\s*accounts?|bank)\b/i;
const TAX_NAME_RE = /\b(duties\s*&\s*taxes|duties and taxes|gst|tds\s*payable|tcs)\b/i;

/**
 * Walk parent group hierarchy (leaf → root).
 */
export async function getAccountGroupChain(groupId, { session } = {}) {
    const chain = [];
    let currentId = groupId || null;
    let guard = 0;
    while (currentId && guard++ < 16) {
        const q = AccountGroup.findById(currentId).select('name nature parentGroup isActive').lean();
        if (session) q.session(session);
        const g = await q;
        if (!g) break;
        chain.push({
            _id: g._id,
            name: g.name || '',
            nature: g.nature || '',
            parentGroup: g.parentGroup || null,
        });
        currentId = g.parentGroup || null;
    }
    return chain;
}

function namesOf(chain) {
    return (chain || []).map((g) => String(g.name || '').trim());
}

export function classifyFromGroupChain(chain = []) {
    const names = namesOf(chain);
    const joined = names.join(' > ');
    const leaf = names[0] || '';
    const nature = chain[0]?.nature || chain.find((g) => g.nature)?.nature || '';

    const hit = (re) => names.some((n) => re.test(n));

    if (hit(CASH_NAME_RE) && nature === 'Assets') {
        return { role: 'cash', leafGroupName: leaf, nature, path: joined };
    }
    if (hit(BANK_NAME_RE) && nature === 'Assets') {
        return { role: 'bank', leafGroupName: leaf, nature, path: joined };
    }
    if (hit(DEBTOR_NAME_RE) && nature === 'Assets') {
        return { role: 'debtor', leafGroupName: leaf, nature, path: joined };
    }
    // Creditors are liability ledgers — exclude Asset advances like "Advance to Suppliers"
    if (hit(CREDITOR_NAME_RE) && nature === 'Liabilities' && !/\badvance\b/i.test(leaf)) {
        return { role: 'creditor', leafGroupName: leaf, nature, path: joined };
    }
    if (hit(TAX_NAME_RE)) {
        return { role: 'tax', leafGroupName: leaf, nature, path: joined };
    }
    if (nature === 'Expenses' || hit(EXPENSE_NAME_RE)) {
        return { role: 'expense', leafGroupName: leaf, nature, path: joined };
    }
    if (nature === 'Income') {
        return { role: 'income', leafGroupName: leaf, nature, path: joined };
    }
    return { role: 'general', leafGroupName: leaf, nature, path: joined };
}

/**
 * Derived ledger fields from group hierarchy (canonical for selectors).
 */
export function deriveLedgerFieldsFromClassification(classification) {
    const groupName = classification.leafGroupName || '';
    const base = {
        groupName,
        isSupplier: false,
        isCustomer: false,
        isBank: false,
        isCashLedger: false,
        isTaxLedger: false,
    };

    switch (classification.role) {
        case 'creditor':
            return {
                ...base,
                type: 'Supplier',
                isSupplier: true,
                expenseCategory: null,
                drCr: 'Cr',
            };
        case 'debtor':
            return {
                ...base,
                type: 'Customer',
                isCustomer: true,
                expenseCategory: null,
                drCr: 'Dr',
            };
        case 'cash':
            return {
                ...base,
                type: 'Cash',
                isCashLedger: true,
                expenseCategory: null,
                drCr: 'Dr',
            };
        case 'bank':
            return {
                ...base,
                type: 'Bank',
                isBank: true,
                expenseCategory: null,
                drCr: 'Dr',
            };
        case 'tax':
            return {
                ...base,
                type: 'Tax',
                isTaxLedger: true,
                expenseCategory: null,
            };
        case 'expense':
            return {
                ...base,
                type: 'Expense',
            };
        case 'income':
            return {
                ...base,
                type: 'Income',
                expenseCategory: null,
                drCr: 'Cr',
            };
        default:
            return {
                ...base,
                type: 'General',
            };
    }
}

export function isCreditorRole(role) {
    return role === 'creditor';
}

export function isExpenseRole(role) {
    return role === 'expense';
}

export function isCashOrBankRole(role) {
    return role === 'cash' || role === 'bank';
}

/**
 * Sync derived classification fields from underGroup.
 * Does not rewrite voucher history — only ledger master flags/denormalized groupName.
 */
export async function syncLedgerClassificationFromGroup(ledgerDoc, { session } = {}) {
    if (!ledgerDoc?.underGroup) return null;
    const chain = await getAccountGroupChain(ledgerDoc.underGroup, { session });
    if (!chain.length) return null;
    const classification = classifyFromGroupChain(chain);
    const derived = deriveLedgerFieldsFromClassification(classification);

    const patch = {
        groupName: derived.groupName,
        type: derived.type,
        isSupplier: !!derived.isSupplier,
        isCustomer: !!derived.isCustomer,
        isBank: !!derived.isBank,
        isCashLedger: !!derived.isCashLedger,
        isTaxLedger: !!derived.isTaxLedger,
    };
    if (Object.prototype.hasOwnProperty.call(derived, 'expenseCategory')) {
        patch.expenseCategory = derived.expenseCategory;
    }
    // Only set default Dr/Cr when becoming creditor/debtor/cash/bank/income (avoid flipping expense OB)
    if (classification.role === 'creditor' || classification.role === 'debtor'
        || classification.role === 'cash' || classification.role === 'bank'
        || classification.role === 'income') {
        if (derived.drCr) patch.drCr = derived.drCr;
    }

    Object.assign(ledgerDoc, patch);
    return { classification, derived, patch };
}

export async function assertExpenseVoucherPartyIsCreditor(partyId, { session } = {}) {
    if (!partyId) {
        const err = new Error('Expense Voucher requires a Supplier or Creditor.');
        err.statusCode = 400;
        throw err;
    }
    const q = AccountLedger.findById(partyId).select('name underGroup type isSupplier isBank isCashLedger groupName');
    if (session) q.session(session);
    const ledger = await q.lean();
    if (!ledger) {
        const err = new Error('Supplier / Creditor ledger not found.');
        err.statusCode = 400;
        throw err;
    }
    if (ledger.isBank || ledger.isCashLedger || ledger.type === 'Cash' || ledger.type === 'Bank') {
        const err = new Error(
            'Expense Voucher requires a Supplier or Creditor. Use Payment Voucher for Bank or Cash payment.',
        );
        err.statusCode = 400;
        throw err;
    }
    const chain = await getAccountGroupChain(ledger.underGroup, { session });
    const classification = classifyFromGroupChain(chain);
    if (isCashOrBankRole(classification.role)) {
        const err = new Error(
            'Expense Voucher requires a Supplier or Creditor. Use Payment Voucher for Bank or Cash payment.',
        );
        err.statusCode = 400;
        throw err;
    }
    if (!isCreditorRole(classification.role) && !(ledger.isSupplier || ledger.type === 'Supplier')) {
        const err = new Error(
            'Expense Voucher requires a Supplier or Creditor. Use Payment Voucher for Bank or Cash payment.',
        );
        err.statusCode = 400;
        throw err;
    }
    return { ledger, classification };
}
