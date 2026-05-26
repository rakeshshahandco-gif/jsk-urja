import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { Voucher } from '../models/voucher.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { BillWiseAdjustment } from '../models/billWiseAdjustment.model.js';
import { assertPostingAllowed } from './accounting/accountingValidation.service.js';
import { logAccountingAudit } from './accounting/accountingAudit.service.js';
import {
    applyBillPaymentDelta,
    findPartyItemIndex,
    isBillWiseLedger,
    getAgeingBucket,
    computeOverdueDays,
} from './accounting/billWiseSettlement.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function sumAgainstBillAdjustments(voucher) {
    if (!voucher?.items?.length) return 0;
    let s = 0;
    for (const item of voucher.items) {
        for (const a of item.adjustments || []) {
            if (a.adjustmentType === 'Against Bill' && a.amount) s += a.amount;
        }
    }
    return r2(s);
}

export function getBillPending(doc, type) {
    const total = r2(type === 'SalesInvoice' ? (doc.roundedTotal || doc.grandTotal) : (doc.grandTotal || doc.totalAmount || 0));
    const paid = r2(doc.paidAmount || 0);
    return Math.max(0, r2(total - paid));
}

function assertPaymentVoucherForLedger(voucher, ledgerId, expectedNature) {
    if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Payment / receipt voucher not found');
    if (voucher.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher is cancelled');
    if (voucher.nature !== expectedNature) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Voucher must be ${expectedNature}`);
    }
    if (String(voucher.partyId) !== String(ledgerId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher party ledger does not match');
    }
}

/**
 * @param {Array<{ billDocumentId: string, billDocumentType: 'SalesInvoice'|'PurchaseInvoice', paymentVoucherId: string, adjustedAmount: number }>} lines
 */
export async function saveAdjustments({
    lines,
    ledgerId,
    userId,
    companyId,
    remarks = '',
    allowCrossFy = false,
    userRole = '',
}) {
    const ledger = await AccountLedger.findById(ledgerId);
    if (!ledger) throw new ApiError(httpStatus.NOT_FOUND, 'Ledger not found');
    if (!isBillWiseLedger(ledger)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Bill-wise settlement is not enabled for this ledger');
    }

    const expectedPaymentNature =
        ledger.type === 'Customer' || ledger.isCustomer ? 'Receipt' : 'Payment';

    for (const line of lines) {
        const amt = r2(line.adjustedAmount);
        if (amt <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Adjustment amount must be greater than zero');
        if (line.billDocumentType === 'SalesInvoice' && expectedPaymentNature !== 'Receipt') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Sales invoice requires receipt voucher');
        }
        if (line.billDocumentType === 'PurchaseInvoice' && expectedPaymentNature !== 'Payment') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase bill requires payment voucher');
        }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const createdDocs = [];
        const fyForLock = lines[0] ? (await Voucher.findById(lines[0].paymentVoucherId).lean())?.financialYear : null;
        if (fyForLock) {
            await assertPostingAllowed({
                voucherDate: new Date(),
                financialYear: fyForLock,
                adminOverride: allowCrossFy && (userRole === 'admin' || userRole === 'superadmin'),
                unlockReason: remarks,
            });
        }

        for (const line of lines) {
            const bill = line.billDocumentType === 'SalesInvoice'
                ? await SalesInvoice.findById(line.billDocumentId).session(session)
                : await PurchaseInvoice.findById(line.billDocumentId).session(session);
            if (!bill) throw new ApiError(httpStatus.NOT_FOUND, 'Bill not found');

            const pending = getBillPending(bill, line.billDocumentType);
            const amt = r2(line.adjustedAmount);
            if (amt > pending + 0.01) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Adjustment exceeds pending bill amount');
            }

            const voucher = await Voucher.findById(line.paymentVoucherId).session(session);
            if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
            assertPaymentVoucherForLedger(voucher, ledgerId, expectedPaymentNature);

            if (!allowCrossFy && userRole !== 'admin' && userRole !== 'superadmin') {
                if (bill.financialYear && voucher.financialYear && bill.financialYear !== voucher.financialYear) {
                    throw new ApiError(httpStatus.BAD_REQUEST, 'Bill and receipt/payment are in different financial years (admin may override)');
                }
            }

            const itemIdx = findPartyItemIndex(voucher);
            const item = voucher.items[itemIdx];
            if (!item) throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher has no party line item');

            const lineTotal = r2(item.amount || 0);
            const alreadyOnLine = r2(
                (item.adjustments || [])
                    .filter((a) => a.adjustmentType === 'Against Bill')
                    .reduce((s, a) => s + (a.amount || 0), 0),
            );
            const availableOnVoucher = r2(lineTotal - alreadyOnLine);
            if (amt > availableOnVoucher + 0.01) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Adjustment exceeds unallocated amount on voucher line');
            }

            const billNo =
                line.billDocumentType === 'SalesInvoice'
                    ? bill.displayInvoiceNumber || bill.invoiceNumber
                    : bill.invoiceNumber || bill.billNumber;

            item.adjustments.push({
                adjustmentType: 'Against Bill',
                refId: line.billDocumentId,
                refModel: line.billDocumentType,
                refNumber: billNo,
                amount: amt,
            });
            await voucher.save({ session });

            const adjRow = item.adjustments[item.adjustments.length - 1];

            await applyBillPaymentDelta(
                {
                    refId: line.billDocumentId,
                    amount: amt,
                    adjustmentType: 'Against Bill',
                    refModel: line.billDocumentType,
                },
                voucher.nature,
                voucher.voucherNo,
                voucher.date,
                session,
                false,
            );

            const rec = await BillWiseAdjustment.create(
                [
                    {
                        companyId,
                        financialYear: voucher.financialYear || bill.financialYear,
                        ledgerId,
                        billDocumentId: line.billDocumentId,
                        billDocumentType: line.billDocumentType,
                        billNo,
                        paymentVoucherId: voucher._id,
                        paymentVoucherType: voucher.voucherTypeName,
                        paymentNo: voucher.voucherNo,
                        paymentNature: voucher.nature,
                        adjustedAmount: amt,
                        remarks: remarks || '',
                        voucherItemIndex: itemIdx,
                        voucherAdjustmentSubId: adjRow._id,
                        createdBy: userId,
                    },
                ],
                { session },
            );
            createdDocs.push(rec[0]);

            await logAccountingAudit({
                action: 'CREATE',
                moduleSource: 'BillWiseSettlement',
                resourceType: 'BillWiseAdjustment',
                resourceId: rec[0]._id,
                voucherNo: voucher.voucherNo,
                financialYear: voucher.financialYear,
                userId,
                newValue: { billNo, amount: amt },
                session,
            });
        }

        await session.commitTransaction();
        return createdDocs;
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
}

export async function reverseAdjustment(adjustmentId, userId, reason, isAdmin) {
    if (!isAdmin) throw new ApiError(httpStatus.FORBIDDEN, 'Only admin can reverse adjustments');
    const row = await BillWiseAdjustment.findById(adjustmentId);
    if (!row) throw new ApiError(httpStatus.NOT_FOUND, 'Adjustment not found');
    if (row.isReversed) throw new ApiError(httpStatus.BAD_REQUEST, 'Already reversed');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const voucher = await Voucher.findById(row.paymentVoucherId).session(session);
        if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
        const item = voucher.items[row.voucherItemIndex];
        if (!item) throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher line missing');
        const sub = (item.adjustments || []).find((a) => String(a._id) === String(row.voucherAdjustmentSubId));
        if (!sub) throw new ApiError(httpStatus.BAD_REQUEST, 'Linked adjustment line not found on voucher');
        const amt = sub.amount;

        await applyBillPaymentDelta(
            {
                refId: row.billDocumentId,
                amount: amt,
                adjustmentType: 'Against Bill',
                refModel: row.billDocumentType,
            },
            voucher.nature,
            voucher.voucherNo,
            voucher.date,
            session,
            true,
        );

        item.adjustments = (item.adjustments || []).filter(
            (a) => String(a._id) !== String(row.voucherAdjustmentSubId),
        );
        await voucher.save({ session });

        row.isReversed = true;
        row.reversedAt = new Date();
        row.reversedBy = userId;
        row.reversalReason = reason || '';
        row.updatedBy = userId;
        await row.save({ session });

        await logAccountingAudit({
            action: 'CANCEL',
            moduleSource: 'BillWiseSettlement',
            resourceType: 'BillWiseAdjustment',
            resourceId: row._id,
            voucherNo: voucher.voucherNo,
            financialYear: row.financialYear,
            userId,
            reason: reason || '',
            oldValue: { adjustedAmount: amt },
            session,
        });

        await session.commitTransaction();
        return row;
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
}

export async function getWorkspaceData(ledgerId, query) {
    const { from, to, financialYear, show = 'all' } = query;
    const ledger = await AccountLedger.findById(ledgerId).lean();
    if (!ledger?.referenceId) throw new ApiError(httpStatus.BAD_REQUEST, 'Ledger must be linked to a customer or supplier');
    if (!isBillWiseLedger(ledger)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Bill-wise settlement is not enabled for this ledger');
    }

    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const fyFilter = financialYear ? { financialYear } : {};

    let bills = [];
    let payments = [];

    if (ledger.type === 'Customer' || ledger.isCustomer) {
        const q = {
            customerId: ledger.referenceId,
            status: 'Confirmed',
            isDeleted: false,
            ...fyFilter,
            ...(Object.keys(dateFilter).length ? { invoiceDate: dateFilter } : {}),
        };
        const raw = await SalesInvoice.find(q).sort({ invoiceDate: 1 }).lean();
        bills = raw.map((si) => {
            const total = r2(si.roundedTotal || si.grandTotal);
            const paid = r2(si.paidAmount || 0);
            const pending = getBillPending(si, 'SalesInvoice');
            const due = si.paymentDueDate ? new Date(si.paymentDueDate) : null;
            const overdueDays = computeOverdueDays(si.paymentDueDate, pending);
            return {
                _id: si._id,
                billDocumentType: 'SalesInvoice',
                billDate: si.invoiceDate,
                billNo: si.displayInvoiceNumber || si.invoiceNumber,
                voucherType: 'Sales Invoice',
                originalAmount: total,
                adjustedAmount: paid,
                pendingAmount: pending,
                dueDate: si.paymentDueDate,
                overdueDays,
                ageingBucket: getAgeingBucket(overdueDays),
                paymentStatus: si.paymentStatus,
                allocationStatus: pending <= 0.01 ? 'Fully Adjusted' : paid > 0.01 ? 'Part Adjusted' : 'Unallocated',
            };
        });
        const pq = {
            partyId: ledgerId,
            nature: 'Receipt',
            status: { $ne: 'Cancelled' },
            isSystemGenerated: { $ne: true },
            ...fyFilter,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
        };
        const vouchers = await Voucher.find(pq).sort({ date: -1 }).lean();
        payments = vouchers.map((v) => {
            const itemIdx = findPartyItemIndex(v);
            const lineAmt = r2(v.items?.[itemIdx]?.amount || v.totalAmount || 0);
            const onBill = r2(
                (v.items?.[itemIdx]?.adjustments || [])
                    .filter((a) => a.adjustmentType === 'Against Bill')
                    .reduce((s, a) => s + (a.amount || 0), 0),
            );
            const avail = Math.max(0, r2(lineAmt - onBill));
            return {
                _id: v._id,
                voucherDate: v.date,
                voucherNo: v.voucherNo,
                voucherType: v.voucherTypeName || 'Receipt',
                amount: lineAmt,
                adjustedAmount: onBill,
                availableBalance: avail,
                adjustmentStatus:
                    onBill <= 0.01 ? 'Unadjusted' : avail <= 0.01 ? 'Fully Adjusted' : 'Part Adjusted',
            };
        });
    } else if (ledger.type === 'Supplier' || ledger.isSupplier) {
        const q = {
            supplierId: ledger.referenceId,
            status: { $in: ['Confirmed', 'Posted'] },
            isDeleted: false,
            ...fyFilter,
            ...(Object.keys(dateFilter).length ? { invoiceDate: dateFilter } : {}),
        };
        const raw = await PurchaseInvoice.find(q).sort({ invoiceDate: 1 }).lean();
        bills = raw.map((pi) => {
            const total = r2(pi.grandTotal || pi.totalAmount);
            const paid = r2(pi.paidAmount || 0);
            const pending = getBillPending(pi, 'PurchaseInvoice');
            const due = pi.dueDate ? new Date(pi.dueDate) : null;
            const overdueDays = computeOverdueDays(pi.dueDate, pending);
            return {
                _id: pi._id,
                billDocumentType: 'PurchaseInvoice',
                billDate: pi.invoiceDate,
                billNo: pi.invoiceNumber,
                voucherType: 'Purchase Bill',
                originalAmount: total,
                adjustedAmount: paid,
                pendingAmount: pending,
                dueDate: pi.dueDate,
                overdueDays,
                ageingBucket: getAgeingBucket(overdueDays),
                paymentStatus: pi.paymentStatus,
                allocationStatus: pending <= 0.01 ? 'Fully Adjusted' : paid > 0.01 ? 'Part Adjusted' : 'Unallocated',
            };
        });
        const pq = {
            partyId: ledgerId,
            nature: 'Payment',
            status: { $ne: 'Cancelled' },
            isSystemGenerated: { $ne: true },
            ...fyFilter,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
        };
        const vouchers = await Voucher.find(pq).sort({ date: -1 }).lean();
        payments = vouchers.map((v) => {
            const itemIdx = findPartyItemIndex(v);
            const lineAmt = r2(v.items?.[itemIdx]?.amount || v.totalAmount || 0);
            const onBill = r2(
                (v.items?.[itemIdx]?.adjustments || [])
                    .filter((a) => a.adjustmentType === 'Against Bill')
                    .reduce((s, a) => s + (a.amount || 0), 0),
            );
            const avail = Math.max(0, r2(lineAmt - onBill));
            return {
                _id: v._id,
                voucherDate: v.date,
                voucherNo: v.voucherNo,
                voucherType: v.voucherTypeName || 'Payment',
                amount: lineAmt,
                adjustedAmount: onBill,
                availableBalance: avail,
                adjustmentStatus:
                    onBill <= 0.01 ? 'Unadjusted' : avail <= 0.01 ? 'Fully Adjusted' : 'Part Adjusted',
            };
        });
    } else {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported ledger type');
    }

    const s = String(show).toLowerCase();
    if (s === 'pending') bills = bills.filter((b) => b.pendingAmount > 0.01);
    else if (s === 'part paid') bills = bills.filter((b) => b.adjustedAmount > 0.01 && b.pendingAmount > 0.01);
    else if (s === 'fully adjusted' || s === 'paid') bills = bills.filter((b) => b.pendingAmount <= 0.01 && b.originalAmount > 0);
    else if (s === 'advance only') payments = payments.filter((p) => p.availableBalance > 0.01);

    return { ledger, bills, payments };
}

export function fifoAllocate({ bills, payments, ledgerType }) {
    const billQueue = bills
        .map((b) => ({
            ...b,
            pending: r2(b.pendingAmount),
        }))
        .filter((b) => b.pending > 0)
        .sort((a, c) => new Date(a.billDate) - new Date(c.billDate));

    const payQueue = payments
        .map((p) => ({
            ...p,
            avail: r2(p.availableBalance),
        }))
        .filter((p) => p.avail > 0)
        .sort((a, c) => new Date(a.voucherDate) - new Date(c.voucherDate));

    const proposed = [];
    let bi = 0;
    let pi = 0;
    while (bi < billQueue.length && pi < payQueue.length) {
        const b = billQueue[bi];
        const p = payQueue[pi];
        const use = r2(Math.min(b.pending, p.avail));
        if (use <= 0) {
            if (b.pending <= 0) bi++;
            else if (p.avail <= 0) pi++;
            continue;
        }
        proposed.push({
            billDocumentId: b._id,
            billDocumentType: ledgerType === 'Customer' ? 'SalesInvoice' : 'PurchaseInvoice',
            paymentVoucherId: p._id,
            adjustedAmount: use,
        });
        b.pending = r2(b.pending - use);
        p.avail = r2(p.avail - use);
        if (b.pending <= 0.009) bi++;
        if (p.avail <= 0.009) pi++;
    }
    return proposed;
}

export function summarizeAgeing(bills) {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 };
    for (const b of bills || []) {
        const key = b.ageingBucket || getAgeingBucket(b.overdueDays);
        buckets[key] = r2((buckets[key] || 0) + (b.pendingAmount || 0));
    }
    return buckets;
}
