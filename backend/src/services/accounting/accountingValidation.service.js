import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { FinancialYear } from '../../models/financialYear.model.js';
import { isDateInFY } from '../../utils/fyUtils.js';
import { DR_CR_TOLERANCE } from './accountingConstants.js';
import { assertDateNotLocked } from './periodLock.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function sumDebitCredit(lines) {
    let debitTotal = 0;
    let creditTotal = 0;
    for (const line of lines || []) {
        const amt = r2(line.amount);
        if (amt <= 0) continue;
        if (line.type === 'Debit') debitTotal += amt;
        else if (line.type === 'Credit') creditTotal += amt;
    }
    return { debitTotal: r2(debitTotal), creditTotal: r2(creditTotal) };
}

export function assertBalancedEntries(lines, label = 'Voucher') {
    const { debitTotal, creditTotal } = sumDebitCredit(lines);
    if (Math.abs(debitTotal - creditTotal) > DR_CR_TOLERANCE) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `${label} is not balanced: Debit ${debitTotal.toFixed(2)} != Credit ${creditTotal.toFixed(2)}`,
        );
    }
    return { debitTotal, creditTotal };
}

export function assertGstMatchesVoucher(voucherSnapshot) {
    const {
        totalTaxableAmount = 0,
        totalCgst = 0,
        totalSgst = 0,
        totalIgst = 0,
        totalTax = 0,
        roundOff = 0,
        grandTotal = 0,
        items = [],
    } = voucherSnapshot || {};

    if (!voucherSnapshot?.isGstEnabled) return;

    let lineTax = 0;
    for (const item of items) {
        lineTax += r2(item.cgstAmount) + r2(item.sgstAmount) + r2(item.igstAmount);
    }
    lineTax = r2(lineTax);

    if (Math.abs(r2(totalCgst + totalSgst + totalIgst) - r2(totalTax)) > DR_CR_TOLERANCE) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'GST breakup does not match voucher tax totals');
    }
    if (lineTax > 0 && Math.abs(lineTax - r2(totalTax)) > DR_CR_TOLERANCE) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Line GST does not match voucher header tax total');
    }

    const computedGrand = r2(totalTaxableAmount + totalTax + roundOff);
    if (Math.abs(computedGrand - r2(grandTotal)) > DR_CR_TOLERANCE) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Grand total does not match taxable + tax + round-off');
    }
}

export async function assertLedgersExist(lines, session = null) {
    const ids = [...new Set((lines || []).map(l => l.ledgerId).filter(Boolean))];
    for (const id of ids) {
        const q = AccountLedger.findById(id);
        if (session) q.session(session);
        const ledger = await q.lean();
        if (!ledger) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Ledger not found: ${id}`);
        }
    }
}

export async function assertFinancialYearValid(financialYear, voucherDate) {
    if (!financialYear) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Financial year is required for accounting posting');
    }
    if (voucherDate && !isDateInFY(voucherDate, financialYear)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Voucher date does not belong to financial year ${financialYear}`,
        );
    }
    const fy = await FinancialYear.findOne({ name: financialYear }).lean();
    if (!fy) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Financial year "${financialYear}" is not defined in master`);
    }
    if (fy.status === 'Closed' || fy.status === 'Archived') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Financial year ${financialYear} is ${fy.status} — posting blocked`);
    }
}

export async function assertPostingAllowed({ voucherDate, financialYear, lockType = 'books', adminOverride = false, unlockReason = '' }) {
    await assertFinancialYearValid(financialYear, voucherDate);
    await assertDateNotLocked({ date: voucherDate, financialYear, lockType, adminOverride, unlockReason });
}

export function buildLinesFromVoucherItems(items) {
    return (items || []).map(item => ({
        ledgerId: item.ledgerId,
        amount: item.amount,
        type: item.type,
    }));
}
