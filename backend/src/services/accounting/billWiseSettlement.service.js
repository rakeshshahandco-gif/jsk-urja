import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { Voucher } from '../../models/voucher.model.js';
import { SalesInvoice } from '../../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../../models/purchaseInvoice.model.js';
import { CreditDebitNote } from '../../models/creditDebitNote.model.js';
import { BillWiseAdjustment } from '../../models/billWiseAdjustment.model.js';
import { assertPostingAllowed } from './accountingValidation.service.js';
import { logAccountingAudit } from './accountingAudit.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const SETTLEMENT_REF_TYPES = Object.freeze([
    'Against Bill',
    'Advance',
    'On Account',
    'New Reference',
    'Opening Credit',
]);

export function isBillWiseLedger(ledger) {
    if (!ledger) return false;
    if (ledger.isBillWise) return true;
    if (ledger.isCustomer || ledger.isSupplier) return true;
    if (ledger.type === 'Customer' || ledger.type === 'Supplier') return true;
    const gn = String(ledger.groupName || '').toLowerCase();
    return /debtor|creditor|customer|supplier|msme/.test(gn);
}

export function getAgeingBucket(overdueDays) {
    const d = Math.max(0, Number(overdueDays) || 0);
    if (d <= 30) return '0-30';
    if (d <= 60) return '31-60';
    if (d <= 90) return '61-90';
    if (d <= 180) return '91-180';
    return '180+';
}

export function computeOverdueDays(dueDate, pendingAmount) {
    if (!dueDate || (pendingAmount || 0) <= 0.01) return 0;
    const due = new Date(dueDate);
    return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000));
}

/**
 * Apply or reverse bill / on-account payment impact on source documents.
 */
export async function applyBillPaymentDelta(adj, nature, voucherNo, date, session, reverse = false) {
    const { refId, amount, adjustmentType, refModel } = adj;
    if (!refId) return;
    if (adjustmentType === 'Opening Credit' || adjustmentType === 'On Account' || adjustmentType === 'Advance') {
        return;
    }
    if (adjustmentType !== 'Against Bill' && adjustmentType !== 'New Reference') return;

    const amt = reverse ? -amount : amount;

    if (nature === 'Receipt' || nature === 'Adjustment' || nature === 'Credit Note') {
        const modelType = refModel || 'SalesInvoice';
        if (modelType === 'CreditDebitNote') {
            const note = await CreditDebitNote.findById(refId).session(session);
            if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Credit note not found');
            if (note.originalInvoiceId) {
                const invoice = await SalesInvoice.findById(note.originalInvoiceId).session(session);
                if (invoice) await applySalesInvoicePaymentDelta(invoice, amt, amount, voucherNo, date, session, reverse);
            }
            return;
        }
        const invoice = await SalesInvoice.findById(refId).session(session);
        if (!invoice) throw new ApiError(httpStatus.NOT_FOUND, 'Sales invoice not found');
        await applySalesInvoicePaymentDelta(invoice, amt, amount, voucherNo, date, session, reverse);
        return;
    }

    if (nature === 'Payment' || nature === 'Debit Note') {
        const modelType = refModel || 'PurchaseInvoice';
        if (modelType === 'Voucher') {
            const doc = await Voucher.findById(refId).session(session);
            if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Expense voucher bill not found');
            await applyVoucherBillPaymentDelta(doc, amt, amount, voucherNo, date, session, reverse);
            return;
        }
        if (modelType === 'CreditDebitNote') {
            const note = await CreditDebitNote.findById(refId).session(session);
            if (note?.originalInvoiceId) {
                const pi = await PurchaseInvoice.findById(note.originalInvoiceId).session(session);
                if (pi) await applyPurchaseInvoicePaymentDelta(pi, amt, amount, voucherNo, date, session, reverse);
            }
            return;
        }
        const doc = await PurchaseInvoice.findById(refId).session(session);
        if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase bill not found');
        await applyPurchaseInvoicePaymentDelta(doc, amt, amount, voucherNo, date, session, reverse);
    }
}

async function applySalesInvoicePaymentDelta(invoice, amt, displayAmount, voucherNo, date, session, reverse) {
    if (invoice.paymentStatus === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Sales Invoice ${invoice.invoiceNumber} is cancelled`);
    }
    invoice.paidAmount = r2((invoice.paidAmount || 0) + amt);
    const total = invoice.roundedTotal || invoice.grandTotal;
    if (invoice.paidAmount >= total - 0.009) invoice.paymentStatus = 'Paid';
    else if (invoice.paidAmount > 0.009) invoice.paymentStatus = 'Partially Paid';
    else {
        invoice.paymentStatus = 'Unpaid';
        invoice.paidAmount = 0;
    }
    const remarkTag = reverse ? 'Bill-wise reversal' : 'Bill-wise Settlement';
    if (!reverse) {
        if (!invoice.payments) invoice.payments = [];
        invoice.payments.push({
            paymentDate: date,
            amountPaid: displayAmount,
            paymentMode: 'Voucher',
            reference: voucherNo,
            remarks: `Receipt ${voucherNo} (${remarkTag})`,
        });
    } else {
        invoice.payments = (invoice.payments || []).filter(
            (p) => !(p.reference === voucherNo && r2(p.amountPaid) === r2(displayAmount)),
        );
    }
    await invoice.save({ session });
}

async function applyPurchaseInvoicePaymentDelta(doc, amt, displayAmount, voucherNo, date, session, reverse) {
    if (doc.paymentStatus === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase bill is cancelled');
    }
    doc.paidAmount = r2((doc.paidAmount || 0) + amt);
    const total = doc.grandTotal || doc.totalAmount;
    if (doc.paidAmount >= total - 0.009) doc.paymentStatus = 'Paid';
    else if (doc.paidAmount > 0.009) doc.paymentStatus = 'Partially Paid';
    else {
        doc.paymentStatus = 'Unpaid';
        doc.paidAmount = 0;
    }
    if (!reverse) {
        if (!doc.payments) doc.payments = [];
        doc.payments.push({
            paymentDate: date,
            amountPaid: displayAmount,
            paymentMode: 'Voucher',
            reference: voucherNo,
            remarks: `Payment ${voucherNo} (Bill-wise Settlement)`,
        });
    } else {
        doc.payments = (doc.payments || []).filter(
            (p) => !(p.reference === voucherNo && r2(p.amountPaid) === r2(displayAmount)),
        );
    }
    await doc.save({ session });
}

async function applyVoucherBillPaymentDelta(doc, amt, displayAmount, voucherNo, date, session, reverse) {
    if (doc.status === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Expense voucher is cancelled');
    }
    doc.paidAmount = r2((doc.paidAmount || 0) + amt);
    const total = doc.grandTotal || doc.totalAmount;
    if (doc.paidAmount >= total - 0.009) doc.paymentStatus = 'Paid';
    else if (doc.paidAmount > 0.009) doc.paymentStatus = 'Partially Paid';
    else {
        doc.paymentStatus = 'Unpaid';
        doc.paidAmount = 0;
    }
    await doc.save({ session });
}

export function findPartyItemIndex(voucher) {
    const party = voucher.partyId ? String(voucher.partyId) : null;
    if (party && voucher.items?.length) {
        const idx = voucher.items.findIndex((it) => String(it.ledgerId) === party);
        if (idx >= 0) return idx;
    }
    if (voucher.nature === 'Receipt' || voucher.nature === 'Credit Note') {
        const cr = voucher.items?.findIndex((it) => it.type === 'Credit');
        if (cr >= 0) return cr;
    }
    if (voucher.nature === 'Payment' || voucher.nature === 'Debit Note') {
        const dr = voucher.items?.findIndex((it) => it.type === 'Debit');
        if (dr >= 0) return dr;
    }
    return 0;
}

export async function syncBillWiseAuditFromVoucher(voucher, session, userId, companyId) {
    if (!voucher?.items?.length) return [];
    const created = [];
    const ledgerId = voucher.partyId;
    if (!ledgerId) return created;

    for (let itemIdx = 0; itemIdx < voucher.items.length; itemIdx++) {
        const item = voucher.items[itemIdx];
        for (const adj of item.adjustments || []) {
            if (adj.adjustmentType !== 'Against Bill' && adj.adjustmentType !== 'New Reference') continue;
            if (!adj._id) continue;

            const exists = await BillWiseAdjustment.findOne({
                paymentVoucherId: voucher._id,
                voucherAdjustmentSubId: adj._id,
                isReversed: false,
            }).session(session);
            if (exists) continue;

            const billType = adj.refModel === 'PurchaseInvoice'
                ? 'PurchaseInvoice'
                : adj.refModel === 'Voucher'
                    ? 'Voucher'
                    : adj.refModel === 'CreditDebitNote'
                        ? 'CreditDebitNote'
                        : 'SalesInvoice';

            const rec = await BillWiseAdjustment.create([{
                companyId,
                financialYear: voucher.financialYear,
                ledgerId,
                billDocumentId: adj.refId,
                billDocumentType: billType,
                billNo: adj.refNumber || '',
                paymentVoucherId: voucher._id,
                paymentVoucherType: voucher.voucherTypeName,
                paymentNo: voucher.voucherNo,
                paymentNature: voucher.nature,
                adjustmentType: adj.adjustmentType,
                adjustedAmount: adj.amount,
                remarks: voucher.narration || '',
                voucherItemIndex: itemIdx,
                voucherAdjustmentSubId: adj._id,
                createdBy: userId,
            }], { session });
            created.push(rec[0]);

            await logAccountingAudit({
                action: 'CREATE',
                moduleSource: 'BillWiseSettlement',
                resourceType: 'BillWiseAdjustment',
                resourceId: rec[0]._id,
                voucherNo: voucher.voucherNo,
                financialYear: voucher.financialYear,
                userId,
                newValue: { billNo: adj.refNumber, amount: adj.amount, type: adj.adjustmentType },
                session,
            });
        }
    }
    return created;
}

export async function reverseAllBillWiseForVoucher(voucher, session, userId, reason = '') {
    const rows = await BillWiseAdjustment.find({
        paymentVoucherId: voucher._id,
        isReversed: false,
    }).session(session);

    for (const row of rows) {
        await applyBillPaymentDelta(
            {
                refId: row.billDocumentId,
                amount: row.adjustedAmount,
                adjustmentType: row.adjustmentType,
                refModel: row.billDocumentType,
            },
            voucher.nature,
            voucher.voucherNo,
            voucher.date,
            session,
            true,
        );
        row.isReversed = true;
        row.reversedAt = new Date();
        row.reversedBy = userId;
        row.reversalReason = reason || 'Voucher cancelled';
        await row.save({ session });
    }

    for (const item of voucher.items || []) {
        for (const adj of item.adjustments || []) {
            if (adj.adjustmentType !== 'Against Bill' && adj.adjustmentType !== 'New Reference') continue;
            const already = rows.some((r) => String(r.voucherAdjustmentSubId) === String(adj._id));
            if (!already) {
                await applyBillPaymentDelta(adj, voucher.nature, voucher.voucherNo, voucher.date, session, true);
            }
        }
    }
}

export async function settleVoucherAdjustments(voucher, session, opts = {}) {
    const { userId, companyId, adminOverride, unlockReason } = opts;
    if (voucher.status === 'Cancelled') return;

    await assertPostingAllowed({
        voucherDate: voucher.date,
        financialYear: voucher.financialYear,
        adminOverride,
        unlockReason,
    });

    for (const item of voucher.items || []) {
        for (const adj of item.adjustments || []) {
            await applyBillPaymentDelta(adj, voucher.nature, voucher.voucherNo, voucher.date, session, false);
        }
    }

    if (companyId && userId) {
        await syncBillWiseAuditFromVoucher(voucher, session, userId, companyId);
    }
}
