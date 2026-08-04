/**
 * Validate Cash/Bank account vs instrumentType for Receipt/Payment vouchers.
 * Uses CashBankAccount.accountType (not ledger name matching).
 */
import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { CashBankAccount } from '../../models/cashBankAccount.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';

const BANK_INSTRUMENTS = new Set([
    'Bank Transfer', 'NEFT', 'RTGS', 'IMPS', 'Cheque', 'UPI', 'Card', 'Other',
]);
const CASH_INSTRUMENTS = new Set(['Cash']);

function resolveKind(account, linkedLedger) {
    const t = String(account?.accountType || '').trim();
    if (t === 'Cash' || t === 'Bank') return t;
    if (linkedLedger?.type === 'Cash' || linkedLedger?.isCashLedger) return 'Cash';
    if (linkedLedger?.type === 'Bank') return 'Bank';
    return null;
}

/**
 * @param {object} opts
 * @param {string|import('mongoose').Types.ObjectId} opts.cashBankAccountId
 * @param {string} [opts.instrumentType]
 * @param {string} [opts.instrumentNo]
 * @param {string} [opts.nature] Receipt | Payment | …
 * @param {import('mongoose').ClientSession|null} [opts.session]
 * @param {string|null} [opts.companyId]
 */
export async function assertCashBankInstrumentCompatible({
    cashBankAccountId,
    instrumentType,
    instrumentNo = '',
    nature = 'Receipt',
    session = null,
    companyId = null,
}) {
    if (!cashBankAccountId) return null;

    let q = CashBankAccount.findById(cashBankAccountId);
    if (session) q = q.session(session);
    const account = await q;
    if (!account) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Cash/Bank account not found');
    }
    if (account.status === 'Inactive') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Selected Cash/Bank account is inactive');
    }

    let linkedLedger = null;
    if (account.ledgerId) {
        let lq = AccountLedger.findById(account.ledgerId);
        if (session) lq = lq.session(session);
        linkedLedger = await lq;
        if (linkedLedger?.status === 'Inactive') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Linked Cash/Bank ledger is inactive');
        }
        if (
            companyId
            && linkedLedger?.companyId
            && String(linkedLedger.companyId) !== String(companyId)
        ) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                'Selected Cash/Bank ledger belongs to another company',
            );
        }
    }

    const kind = resolveKind(account, linkedLedger);
    const inst = String(instrumentType || '').trim();
    const isPayment = String(nature || '').toLowerCase() === 'payment';

    if (!inst) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Instrument Type is required');
    }

    if (kind === 'Bank' && inst === 'Cash') {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            isPayment
                ? 'Cash instrument cannot be used when paying from a Bank ledger.'
                : 'Cash instrument cannot be used when depositing into a Bank ledger.',
        );
    }
    if (kind === 'Cash' && BANK_INSTRUMENTS.has(inst)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            isPayment
                ? 'Bank instrument cannot be used when paying from a Cash ledger.'
                : 'Bank instrument cannot be used when depositing into a Cash ledger.',
        );
    }
    if (kind === 'Bank' && !BANK_INSTRUMENTS.has(inst)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Instrument "${inst}" is not valid for a Bank account.`,
        );
    }
    if (kind === 'Cash' && !CASH_INSTRUMENTS.has(inst)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Instrument "${inst}" is not valid for a Cash account.`,
        );
    }
    if (inst === 'Cheque' && !String(instrumentNo || '').trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cheque Number is required for Cheque');
    }

    return account;
}
