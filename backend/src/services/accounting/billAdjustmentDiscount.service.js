/**
 * Phase 1 — Bill-adjustment Discount Allowed / Discount Received GL posting.
 * Receipt: Dr Discount Allowed, increase Customer Cr (Bank Dr stays bank-only).
 * Payment: Cr Discount Received, increase Supplier Dr (Bank Cr stays bank-only).
 */
import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { AccountLedger } from '../../models/accountLedger.model.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function settlementAmountFromAdjustment(adj) {
    return r2(
        (Number(adj?.amount) || 0)
        + (Number(adj?.discountAmount) || 0)
        + (Number(adj?.roundOff) || 0),
    );
}

/**
 * Validate discount fields and rewrite voucher items:
 * - strip prior BillAdjustmentDiscount lines (edit-safe / idempotent)
 * - bump party line amount by discount (+ round-off)
 * - append discount (and round-off) linked lines
 */
export async function enrichItemsWithBillAdjustmentDiscount({
    items,
    nature,
    companyId = null,
    session = null,
}) {
    if (nature !== 'Receipt' && nature !== 'Payment') {
        return { items: items || [], discountTotal: 0, roundOffTotal: 0 };
    }

    const working = (items || [])
        .filter((i) => i?.lineRole !== 'BillAdjustmentDiscount' && i?.lineRole !== 'BillAdjustmentRoundOff')
        .map((i) => ({
            ...i,
            adjustments: (i.adjustments || []).map((a) => ({ ...a })),
        }));

    const discountLines = [];
    let discountTotal = 0;
    let roundOffTotal = 0;

    for (const item of working) {
        let addToParty = 0;

        for (const adj of item.adjustments || []) {
            if (adj.adjustmentType !== 'Against Bill' && adj.adjustmentType !== 'New Reference') {
                continue;
            }

            const disc = r2(adj.discountAmount);
            const roff = r2(adj.roundOff);

            if (disc < -0.009) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Discount cannot be negative');
            }

            if (disc > 0.009) {
                let ledgerId = adj.discountLedgerId;
                let reason = String(adj.discountReason || adj.remarks || '').trim();
                if (!ledgerId) {
                    // Resolve common discount ledgers if UI omitted id
                    let findQ = AccountLedger.findOne({
                        status: { $ne: 'Inactive' },
                        name: nature === 'Receipt'
                            ? /^(discount\s*allowed|discount)$/i
                            : /^(discount\s*received|discount)$/i,
                    });
                    if (session) findQ = findQ.session(session);
                    const autoLedger = await findQ;
                    if (!autoLedger) {
                        throw new ApiError(
                            httpStatus.BAD_REQUEST,
                            `Discount on bill ${adj.refNumber || ''} requires a Discount ledger`,
                        );
                    }
                    adj.discountLedgerId = autoLedger._id;
                    ledgerId = autoLedger._id;
                }
                if (!reason) {
                    reason = 'Bill adjustment discount';
                    adj.discountReason = reason;
                }

                let q = AccountLedger.findById(ledgerId);
                if (session) q = q.session(session);
                const ledger = await q;
                if (!ledger) {
                    throw new ApiError(httpStatus.BAD_REQUEST, 'Discount ledger not found');
                }
                if (ledger.status === 'Inactive') {
                    throw new ApiError(httpStatus.BAD_REQUEST, `Discount ledger "${ledger.name}" is inactive`);
                }
                if (companyId && ledger.companyId && String(ledger.companyId) !== String(companyId)) {
                    throw new ApiError(
                        httpStatus.BAD_REQUEST,
                        `Discount ledger "${ledger.name}" belongs to another company`,
                    );
                }

                const label = nature === 'Receipt' ? 'Discount Allowed' : 'Discount Received';
                discountLines.push({
                    ledgerId: ledger._id,
                    ledgerName: ledger.name,
                    amount: disc,
                    type: nature === 'Receipt' ? 'Debit' : 'Credit',
                    narration: `${label} vs ${adj.refNumber || 'bill'}: ${reason}`,
                    lineRole: 'BillAdjustmentDiscount',
                    adjustments: [],
                    linkedBillRefId: adj.refId || null,
                    linkedBillRefNumber: adj.refNumber || '',
                });
                addToParty = r2(addToParty + disc);
                discountTotal = r2(discountTotal + disc);
            }

            if (Math.abs(roff) > 0.009) {
                let rq = AccountLedger.findOne({ name: /^Round Off$/i });
                if (session) rq = rq.session(session);
                const roundLedger = await rq;
                if (!roundLedger) {
                    throw new ApiError(
                        httpStatus.BAD_REQUEST,
                        'Round Off ledger is required when bill adjustment round-off is used',
                    );
                }
                // Receipt: positive round-off → Debit Round Off (with Customer Cr up)
                // Payment: positive round-off → Credit Round Off (with Supplier Dr up)
                const abs = Math.abs(roff);
                const type = nature === 'Receipt'
                    ? (roff >= 0 ? 'Debit' : 'Credit')
                    : (roff >= 0 ? 'Credit' : 'Debit');
                discountLines.push({
                    ledgerId: roundLedger._id,
                    ledgerName: roundLedger.name,
                    amount: abs,
                    type,
                    narration: `Round-off vs ${adj.refNumber || 'bill'}`,
                    lineRole: 'BillAdjustmentRoundOff',
                    adjustments: [],
                    linkedBillRefId: adj.refId || null,
                    linkedBillRefNumber: adj.refNumber || '',
                });
                addToParty = r2(addToParty + roff);
                roundOffTotal = r2(roundOffTotal + roff);
            }
        }

        if (Math.abs(addToParty) > 0.009) {
            item.amount = r2((Number(item.amount) || 0) + addToParty);
            if (item.amount < 0.01) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    'Party line amount became invalid after discount/round-off',
                );
            }
        }
    }

    // Prevent accidental duplicate discount lines in the same payload
    const seen = new Set();
    for (const line of discountLines) {
        const key = `${line.lineRole}:${line.ledgerId}:${line.linkedBillRefId}:${line.amount}:${line.narration}`;
        if (seen.has(key)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate discount ledger line blocked');
        }
        seen.add(key);
    }

    return {
        items: [...working, ...discountLines],
        discountTotal,
        roundOffTotal,
    };
}

/**
 * Build Dr/Cr lines for balance check: bank main + all voucher items.
 */
export function buildReceiptPaymentBalanceLines({
    nature,
    bankAmount,
    items,
}) {
    const lines = [];
    const bank = r2(bankAmount);
    if (bank > 0) {
        lines.push({
            ledgerId: 'bank',
            amount: bank,
            type: nature === 'Payment' ? 'Credit' : 'Debit',
        });
    }
    for (const item of items || []) {
        lines.push({
            ledgerId: item.ledgerId,
            amount: r2(item.amount),
            type: item.type,
        });
    }
    return lines;
}
