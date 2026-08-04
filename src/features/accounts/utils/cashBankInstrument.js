/**
 * Instrument Type options depend on CashBankAccount.accountType (Cash | Bank).
 * Values match voucher.model instrumentType comments / existing UI.
 */

export const CASH_INSTRUMENT_OPTIONS = Object.freeze([
    { value: 'Cash', label: 'Cash' },
]);

export const BANK_INSTRUMENT_OPTIONS = Object.freeze([
    { value: 'Bank Transfer', label: 'Bank Transfer' },
    { value: 'NEFT', label: 'NEFT' },
    { value: 'RTGS', label: 'RTGS' },
    { value: 'IMPS', label: 'IMPS' },
    { value: 'Cheque', label: 'Cheque' },
    { value: 'UPI', label: 'UPI' },
    { value: 'Card', label: 'Card' },
    { value: 'Other', label: 'Other' },
]);

const BANK_VALUES = new Set(BANK_INSTRUMENT_OPTIONS.map((o) => o.value));
const CASH_VALUES = new Set(CASH_INSTRUMENT_OPTIONS.map((o) => o.value));

/** @returns {'Cash'|'Bank'|null} */
export function getCashBankAccountKind(account) {
    if (!account) return null;
    const t = String(account.accountType || '').trim();
    if (t === 'Cash' || t === 'Bank') return t;
    // Linked ledger type as secondary authority (not name matching)
    const ledgerType = String(account.ledgerType || account.type || '').trim();
    if (ledgerType === 'Cash' || account.isCashLedger === true) return 'Cash';
    if (ledgerType === 'Bank') return 'Bank';
    return null;
}

export function getInstrumentOptionsForAccount(account) {
    const kind = getCashBankAccountKind(account);
    if (kind === 'Cash') return [...CASH_INSTRUMENT_OPTIONS];
    if (kind === 'Bank') return [...BANK_INSTRUMENT_OPTIONS];
    // Unknown — show both until classified (still validated on save)
    return [...CASH_INSTRUMENT_OPTIONS, ...BANK_INSTRUMENT_OPTIONS];
}

export function defaultInstrumentForAccount(account) {
    const kind = getCashBankAccountKind(account);
    if (kind === 'Cash') return 'Cash';
    if (kind === 'Bank') return 'Bank Transfer';
    return '';
}

/** Clear incompatible instrument when Deposit Into / Paid From changes. */
export function coerceInstrumentForAccount(account, currentInstrument) {
    const kind = getCashBankAccountKind(account);
    const cur = String(currentInstrument || '').trim();
    if (kind === 'Bank') {
        if (cur === 'Cash' || !BANK_VALUES.has(cur)) return 'Bank Transfer';
        return cur;
    }
    if (kind === 'Cash') {
        if (cur !== 'Cash' && CASH_VALUES.has('Cash')) return 'Cash';
        if (!CASH_VALUES.has(cur)) return 'Cash';
        return cur;
    }
    return cur;
}

export function getInstrumentRefMeta(instrumentType) {
    const t = String(instrumentType || '').trim();
    if (t === 'Cheque') {
        return { label: 'Cheque Number', placeholder: 'Enter cheque number', required: true };
    }
    if (t === 'UPI') {
        return { label: 'UPI Transaction ID', placeholder: 'Enter UPI transaction ID', required: false };
    }
    if (t === 'NEFT' || t === 'RTGS' || t === 'IMPS' || t === 'Bank Transfer') {
        return { label: 'UTR / Transaction Reference', placeholder: 'Enter UTR / transaction reference', required: false };
    }
    if (t === 'Card') {
        return { label: 'Card Reference', placeholder: 'Enter card reference (optional)', required: false };
    }
    if (t === 'Other') {
        return { label: 'Reference', placeholder: 'Enter reference (optional)', required: false };
    }
    if (t === 'Cash') {
        return { label: 'Cash Receipt Reference', placeholder: 'Optional cash receipt reference', required: false };
    }
    return { label: 'Instrument / Ref No.', placeholder: 'Reference (optional)', required: false };
}

/**
 * @param {'receipt'|'payment'} [context='receipt']
 * @returns {string|null} error message or null if ok
 */
export function validateInstrumentForAccount(account, instrumentType, instrumentNo = '', context = 'receipt') {
    if (!account) return 'Select Cash/Bank account';
    if (account.status && account.status !== 'Active') {
        return 'Selected Cash/Bank account is inactive';
    }
    const kind = getCashBankAccountKind(account);
    const inst = String(instrumentType || '').trim();
    if (!inst) return 'Select Instrument Type';

    const bankCashMsg = context === 'payment'
        ? 'Cash instrument cannot be used when paying from a Bank ledger.'
        : 'Cash instrument cannot be used when depositing into a Bank ledger.';
    const cashBankMsg = context === 'payment'
        ? 'Bank instrument cannot be used when paying from a Cash ledger.'
        : 'Bank instrument cannot be used when depositing into a Cash ledger.';

    if (kind === 'Bank' && inst === 'Cash') {
        return bankCashMsg;
    }
    if (kind === 'Cash' && BANK_VALUES.has(inst) && inst !== 'Cash') {
        return cashBankMsg;
    }
    if (kind === 'Bank' && !BANK_VALUES.has(inst)) {
        return `Instrument "${inst}" is not valid for a Bank account.`;
    }
    if (kind === 'Cash' && !CASH_VALUES.has(inst)) {
        return `Instrument "${inst}" is not valid for a Cash account.`;
    }

    const meta = getInstrumentRefMeta(inst);
    if (meta.required && !String(instrumentNo || '').trim()) {
        return `${meta.label} is required for ${inst}`;
    }
    return null;
}
