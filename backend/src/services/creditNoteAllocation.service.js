/**
 * Phase 4A — Customer Credit Note → Sales Invoice bill allocation.
 * Single authority: BillWiseAdjustment rows with
 *   billDocumentType = SalesInvoice (target)
 *   settlementSourceType = CreditDebitNote (source)
 * Available balance = grandTotal − SUM(active CN-source allocations).
 */
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { CreditDebitNote } from '../models/creditDebitNote.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { BillWiseAdjustment } from '../models/billWiseAdjustment.model.js';
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { postLedgerEntry } from '../utils/ledgerDispatcher.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';
import { applyBillPaymentDelta } from './accounting/billWiseSettlement.service.js';
import { logAccountingAudit } from './accounting/accountingAudit.service.js';
import { checkUserPermission } from '../utils/permissionUtils.js';
import { resolveCreditNoteIncomeLedger } from './systemLedger.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function assertBillAdjustmentPermission(user, action) {
    const role = String(user?.role?.name || user?.roleName || '').toLowerCase();
    if (role === 'admin' || role === 'superadmin') return;
    const key =
        action === 'view'
            ? 'accounts.bill_adjustment.view_note_balance'
            : action === 'use'
                ? 'accounts.bill_adjustment.use_credit_note'
                : 'accounts.bill_adjustment.reverse_note_allocation';
    if (!checkUserPermission(user, key)) {
        throw new ApiError(httpStatus.FORBIDDEN, `Permission denied: ${key} required`);
    }
}

/** Active CN→SI allocation sum for a Credit Note. */
export async function sumActiveCreditNoteAllocations(creditNoteId, session = null) {
    const rows = await BillWiseAdjustment.find({
        settlementSourceType: 'CreditDebitNote',
        settlementSourceId: creditNoteId,
        billDocumentType: 'SalesInvoice',
        isReversed: { $ne: true },
    })
        .session(session)
        .select('adjustedAmount')
        .lean();
    return r2(rows.reduce((s, r) => s + (Number(r.adjustedAmount) || 0), 0));
}

export async function getCreditNoteAvailableBalance(note, session = null) {
    const original = r2(note.grandTotal || 0);
    const applied = await sumActiveCreditNoteAllocations(note._id, session);
    return {
        originalAmount: original,
        appliedAmount: applied,
        availableBalance: Math.max(0, r2(original - applied)),
    };
}

export async function rebuildCreditNoteAppliedAmount(creditNoteId, session = null) {
    const applied = await sumActiveCreditNoteAllocations(creditNoteId, session);
    await CreditDebitNote.findByIdAndUpdate(
        creditNoteId,
        { $set: { appliedAmount: applied } },
        { session },
    );
    return applied;
}

/**
 * Option B — one idempotent linked GL voucher on Final Customer Credit Note.
 * Customer Cr once for grandTotal; Sales Return (or mapped income) / Output GST Dr.
 * Does NOT change CN GST statutory amounts — ledger mirror only.
 *
 * @param {object} note
 * @param {string} userId
 * @param {string|null} companyId
 * @param {import('mongoose').ClientSession} session
 * @param {{ user?: object }} [opts]
 */
export async function postCustomerCreditNoteAccounting(note, userId, companyId, session, opts = {}) {
    if (note.noteType !== 'Credit Note') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Only Customer Credit Notes post this accounting link');
    }
    if (note.linkedVoucherId) {
        const existing = await Voucher.findById(note.linkedVoucherId).session(session);
        if (existing && existing.status !== 'Cancelled') {
            return existing;
        }
    }

    let customerLedger = await AccountLedger.findOne({ referenceId: note.customerId }).session(session);
    if (!customerLedger) {
        customerLedger = await AccountLedger.findOne({ name: note.customerName }).session(session);
    }
    if (!customerLedger) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Customer ledger not found for ${note.customerName}`);
    }

    const incomeResolved = await resolveCreditNoteIncomeLedger(note.reason, {
        session,
        user: opts.user || { id: userId, roleName: 'admin' },
        autoCreate: true,
    });
    const salesReturnLedger = incomeResolved.ledger;

    const cgstLedger = await AccountLedger.findOne({ name: 'CGST Output' }).session(session);
    const sgstLedger = await AccountLedger.findOne({ name: 'SGST Output' }).session(session);
    const igstLedger = await AccountLedger.findOne({ name: 'IGST Output' }).session(session);
    const roundOffLedger = await AccountLedger.findOne({ name: 'Round Off' }).session(session);

    let vType = await VoucherType.findOne({ nature: 'Credit Note' }).session(session);
    if (!vType) {
        const created = await VoucherType.create([{
            name: 'Credit Note (System)',
            nature: 'Credit Note',
            prefix: 'CN/',
            autoNumbering: true,
            createdBy: userId,
        }], { session });
        vType = created[0];
    }

    const date = note.noteDate || new Date();
    const fy = note.financialYear;
    const voucherNo = await getNextVoucherNo(vType._id, date, session);
    const grand = r2(note.grandTotal || 0);
    const taxable = r2(note.totalTaxableAmount || 0);
    const cgst = r2(note.totalCgst || 0);
    const sgst = r2(note.totalSgst || 0);
    const igst = r2(note.totalIgst || 0);
    const roundOff = Number(note.roundOff) || 0;

    const incomeNarration = incomeResolved.usedFallback
        ? `Credit Note ${note.noteNumber} — discount (posted to ${salesReturnLedger.name})`
        : `Credit Note ${note.noteNumber} — sales return`;

    const items = [
        {
            ledgerId: salesReturnLedger._id,
            ledgerName: salesReturnLedger.name,
            amount: Math.max(0.01, taxable || grand),
            type: 'Debit',
            narration: incomeNarration,
            adjustments: [],
        },
    ];
    if (cgst > 0) {
        if (!cgstLedger) {
            throw new ApiError(httpStatus.BAD_REQUEST, "System ledger matching 'CGST Output' is missing");
        }
        items.push({
            ledgerId: cgstLedger._id, ledgerName: cgstLedger.name, amount: cgst, type: 'Debit',
            narration: `CN ${note.noteNumber} Output CGST reverse`, adjustments: [],
        });
    }
    if (sgst > 0) {
        if (!sgstLedger) {
            throw new ApiError(httpStatus.BAD_REQUEST, "System ledger matching 'SGST Output' is missing");
        }
        items.push({
            ledgerId: sgstLedger._id, ledgerName: sgstLedger.name, amount: sgst, type: 'Debit',
            narration: `CN ${note.noteNumber} Output SGST reverse`, adjustments: [],
        });
    }
    if (igst > 0) {
        if (!igstLedger) {
            throw new ApiError(httpStatus.BAD_REQUEST, "System ledger matching 'IGST Output' is missing");
        }
        items.push({
            ledgerId: igstLedger._id, ledgerName: igstLedger.name, amount: igst, type: 'Debit',
            narration: `CN ${note.noteNumber} Output IGST reverse`, adjustments: [],
        });
    }
    if (roundOff !== 0 && roundOffLedger) {
        items.push({
            ledgerId: roundOffLedger._id,
            ledgerName: roundOffLedger.name,
            amount: Math.abs(roundOff),
            type: roundOff > 0 ? 'Debit' : 'Credit',
            narration: `CN ${note.noteNumber} round off`,
            adjustments: [],
        });
    }
    items.push({
        ledgerId: customerLedger._id,
        ledgerName: customerLedger.name,
        amount: grand,
        type: 'Credit',
        narration: `Credit Note ${note.noteNumber}`,
        adjustments: [],
    });

    const debitSum = r2(items.filter((i) => i.type === 'Debit').reduce((s, i) => s + i.amount, 0));
    const creditSum = r2(items.filter((i) => i.type === 'Credit').reduce((s, i) => s + i.amount, 0));
    if (Math.abs(debitSum - creditSum) > 0.05) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Credit Note accounting is out of balance (Dr ${debitSum} ≠ Cr ${creditSum}). Fix amounts before finalising.`,
        );
    }

    const [voucher] = await Voucher.create([{
        voucherNo,
        voucherType: vType._id,
        voucherTypeName: vType.name,
        nature: 'Credit Note',
        date,
        partyId: customerLedger._id,
        partyName: customerLedger.name,
        totalAmount: grand,
        narration: `System-linked accounting for Credit Note ${note.noteNumber}`,
        items,
        isSystemGenerated: true,
        createdBy: userId,
        status: 'Confirmed',
        financialYear: fy,
    }], { session });

    for (const it of items) {
        await postLedgerEntry({
            voucherId: voucher._id,
            voucherNo,
            date,
            ledgerId: it.ledgerId,
            amount: it.amount,
            type: it.type,
            narration: it.narration,
            financialYear: fy,
        }, session);
    }

    note.linkedVoucherId = voucher._id;
    note.accountingPostedAt = new Date();
    if (companyId && !note.companyId) note.companyId = companyId;
    await note.save({ session });

    return voucher;
}

export async function listAvailableCustomerCreditNotes({
    customerId,
    companyId = null,
    financialYear = null,
}) {
    const filter = {
        noteType: 'Credit Note',
        status: 'Final',
        isDeleted: { $ne: true },
        customerId,
    };
    if (companyId) {
        filter.$or = [{ companyId }, { companyId: null }, { companyId: { $exists: false } }];
    }
    if (financialYear) filter.financialYear = financialYear;

    const notes = await CreditDebitNote.find(filter)
        .populate('originalInvoiceId', 'invoiceNumber invoiceDate')
        .sort({ noteDate: -1 })
        .lean();

    const out = [];
    for (const n of notes) {
        if (!n.linkedVoucherId) continue; // accounting link required
        const bal = await getCreditNoteAvailableBalance(n);
        if (bal.availableBalance <= 0.009) continue;
        out.push({
            _id: n._id,
            noteNumber: n.noteNumber,
            noteDate: n.noteDate,
            originalAmount: bal.originalAmount,
            appliedAmount: bal.appliedAmount,
            availableBalance: bal.availableBalance,
            linkedOriginalInvoice: n.originalInvoiceId
                ? {
                    _id: n.originalInvoiceId._id,
                    invoiceNumber: n.originalInvoiceId.invoiceNumber,
                    invoiceDate: n.originalInvoiceId.invoiceDate,
                }
                : null,
            remarks: n.remarks || '',
            linkedVoucherId: n.linkedVoucherId,
            financialYear: n.financialYear,
            customerId: n.customerId,
        });
    }
    return out;
}

/**
 * Allocate Customer Credit Note(s) to Sales Invoice(s).
 * lines: [{ creditNoteId, salesInvoiceId, amount, remarks? }]
 */
async function applyCustomerCreditNoteAllocationsInSession({
    lines,
    userId,
    companyId,
    sourceMode = 'BillWisePage',
    parentReceiptVoucherId = null,
    remarks = '',
    session,
}) {
    const created = [];
    const noteOrder = [...new Set(lines.map((l) => String(l.creditNoteId)))];

    for (const noteId of noteOrder) {
        const noteLines = lines.filter((l) => String(l.creditNoteId) === noteId);
        const note = await CreditDebitNote.findById(noteId).session(session);
        if (!note || note.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'Credit Note not found');
        if (note.noteType !== 'Credit Note') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Only Customer Credit Notes can be applied');
        }
        if (note.status !== 'Final') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Only Final Credit Notes can be applied');
        }
        if (!note.linkedVoucherId) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                'Credit Note has no linked accounting voucher. Finalize again or contact admin.',
            );
        }
        if (companyId && note.companyId && String(note.companyId) !== String(companyId)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Cross-company Credit Note allocation blocked');
        }

        const cnVoucher = await Voucher.findById(note.linkedVoucherId).session(session);
        if (!cnVoucher || cnVoucher.status === 'Cancelled') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Linked Credit Note voucher is missing or cancelled');
        }

        let bal = await getCreditNoteAvailableBalance(note, session);

        for (const line of noteLines) {
            const amt = r2(line.amount);
            if (amt <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Allocation amount must be greater than zero');

            bal = await getCreditNoteAvailableBalance(note, session);
            if (amt > bal.availableBalance + 0.01) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    `Credit Note ${note.noteNumber}: allocation ₹${amt} exceeds available ₹${bal.availableBalance}`,
                );
            }

            const invoice = await SalesInvoice.findById(line.salesInvoiceId).session(session);
            if (!invoice) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Invoice not found');
            if (invoice.status === 'Cancelled' || invoice.paymentStatus === 'Cancelled') {
                throw new ApiError(httpStatus.BAD_REQUEST, `Invoice ${invoice.invoiceNumber} is cancelled`);
            }
            if (String(invoice.customerId) !== String(note.customerId)) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Cross-customer Credit Note allocation blocked');
            }

            const invTotal = r2(invoice.roundedTotal || invoice.grandTotal || 0);
            const pending = Math.max(0, r2(invTotal - (invoice.paidAmount || 0)));
            if (amt > pending + 0.01) {
                throw new ApiError(
                    httpStatus.BAD_REQUEST,
                    `Allocation exceeds invoice ${invoice.invoiceNumber} outstanding ₹${pending}`,
                );
            }

            const availableBefore = bal.availableBalance;
            const availableAfter = r2(availableBefore - amt);

            const partyIdx = (cnVoucher.items || []).findIndex(
                (it) => String(it.ledgerId) === String(cnVoucher.partyId) && it.type === 'Credit',
            );
            const itemIdx = partyIdx >= 0 ? partyIdx : 0;
            if (!cnVoucher.items[itemIdx]) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Credit Note voucher has no party line');
            }
            if (!cnVoucher.items[itemIdx].adjustments) cnVoucher.items[itemIdx].adjustments = [];
            cnVoucher.items[itemIdx].adjustments.push({
                adjustmentType: 'Against Bill',
                refId: invoice._id,
                refModel: 'SalesInvoice',
                refNumber: invoice.invoiceNumber,
                amount: amt,
            });
            await cnVoucher.save({ session });
            const adjSub = cnVoucher.items[itemIdx].adjustments[
                cnVoucher.items[itemIdx].adjustments.length - 1
            ];

            await applyBillPaymentDelta(
                {
                    refId: invoice._id,
                    refModel: 'SalesInvoice',
                    amount: amt,
                    adjustmentType: 'Against Bill',
                },
                'Credit Note',
                cnVoucher.voucherNo,
                cnVoucher.date || note.noteDate,
                session,
                false,
            );

            const [rec] = await BillWiseAdjustment.create([{
                companyId: companyId || note.companyId || undefined,
                financialYear: note.financialYear || invoice.financialYear,
                ledgerId: cnVoucher.partyId,
                billDocumentId: invoice._id,
                billDocumentType: 'SalesInvoice',
                billNo: invoice.invoiceNumber,
                paymentVoucherId: cnVoucher._id,
                paymentVoucherType: cnVoucher.voucherTypeName || 'Credit Note',
                paymentNo: cnVoucher.voucherNo,
                paymentNature: 'Credit Note',
                adjustmentType: 'Against Bill',
                settlementSourceType: 'CreditDebitNote',
                settlementSourceId: note._id,
                settlementSourceNumber: note.noteNumber,
                settlementSourceModel: 'CreditDebitNote',
                availableBefore,
                availableAfter,
                sourceMode,
                customerId: note.customerId,
                parentReceiptVoucherId: parentReceiptVoucherId || null,
                adjustedAmount: amt,
                remarks: line.remarks || remarks || '',
                voucherItemIndex: itemIdx,
                voucherAdjustmentSubId: adjSub._id,
                createdBy: userId,
                updatedBy: userId,
                adjustmentDate: new Date(),
            }], { session });

            await logAccountingAudit({
                action: 'CREATE',
                moduleSource: 'CreditNoteAllocation',
                resourceType: 'BillWiseAdjustment',
                resourceId: rec._id,
                userId,
                reason: `CN ${note.noteNumber} → SI ${invoice.invoiceNumber} ₹${amt}`,
                newValue: {
                    creditNoteId: note._id,
                    salesInvoiceId: invoice._id,
                    amount: amt,
                    availableBefore,
                    availableAfter,
                    parentReceiptVoucherId,
                    sourceMode,
                },
                session,
            });

            created.push(rec);
            bal = { ...bal, availableBalance: availableAfter, appliedAmount: r2(bal.appliedAmount + amt) };
        }

        await rebuildCreditNoteAppliedAmount(note._id, session);
    }

    return created;
}

export async function applyCustomerCreditNoteAllocations({
    lines,
    userId,
    companyId,
    sourceMode = 'BillWisePage',
    parentReceiptVoucherId = null,
    remarks = '',
    user = null,
    session: externalSession = null,
}) {
    if (user) assertBillAdjustmentPermission(user, 'use');
    if (!Array.isArray(lines) || !lines.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'lines[] required');
    }

    if (externalSession) {
        return applyCustomerCreditNoteAllocationsInSession({
            lines,
            userId,
            companyId,
            sourceMode,
            parentReceiptVoucherId,
            remarks,
            session: externalSession,
        });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const created = await applyCustomerCreditNoteAllocationsInSession({
            lines,
            userId,
            companyId,
            sourceMode,
            parentReceiptVoucherId,
            remarks,
            session,
        });
        await session.commitTransaction();
        return created;
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
}

async function reverseCnAllocationRow(row, userId, reason, session) {
    if (row.isReversed) throw new ApiError(httpStatus.BAD_REQUEST, 'Allocation already reversed');
    if (row.settlementSourceType !== 'CreditDebitNote') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Not a Credit Note allocation');
    }

    const voucher = await Voucher.findById(row.paymentVoucherId).session(session);
    if (voucher?.items?.[row.voucherItemIndex]) {
        const item = voucher.items[row.voucherItemIndex];
        item.adjustments = (item.adjustments || []).filter(
            (a) => String(a._id) !== String(row.voucherAdjustmentSubId),
        );
        await voucher.save({ session });
    }

    await applyBillPaymentDelta(
        {
            refId: row.billDocumentId,
            refModel: 'SalesInvoice',
            amount: row.adjustedAmount,
            adjustmentType: 'Against Bill',
        },
        'Credit Note',
        row.paymentNo,
        row.adjustmentDate,
        session,
        true,
    );

    row.isReversed = true;
    row.reversedAt = new Date();
    row.reversedBy = userId;
    row.reversalReason = reason || 'Reversed';
    row.updatedBy = userId;
    await row.save({ session });

    if (row.settlementSourceId) {
        await rebuildCreditNoteAppliedAmount(row.settlementSourceId, session);
    }

    await logAccountingAudit({
        action: 'CANCEL',
        moduleSource: 'CreditNoteAllocation',
        resourceType: 'BillWiseAdjustment',
        resourceId: row._id,
        userId,
        reason: row.reversalReason,
        session,
    });

    return row;
}

export async function reverseCustomerCreditNoteAllocation(adjustmentId, userId, reason, user = null) {
    if (user) assertBillAdjustmentPermission(user, 'reverse');
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const row = await BillWiseAdjustment.findById(adjustmentId).session(session);
        if (!row) throw new ApiError(httpStatus.NOT_FOUND, 'Allocation not found');
        await reverseCnAllocationRow(row, userId, reason, session);
        await session.commitTransaction();
        return row;
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
}

/**
 * Reverse CN allocations that were applied together with a bank Receipt/Adjustment.
 * Uses the parent voucher's existing transaction session (no nested transaction).
 * Does not require reverse_note_allocation — parent cancel is the authority.
 */
export async function reverseCreditNoteAllocationsForParentReceipt(
    parentReceiptVoucherId,
    userId,
    reason,
    session,
) {
    if (!parentReceiptVoucherId) return [];
    const rows = await BillWiseAdjustment.find({
        parentReceiptVoucherId,
        settlementSourceType: 'CreditDebitNote',
        isReversed: { $ne: true },
    }).session(session);

    const reversed = [];
    for (const row of rows) {
        await reverseCnAllocationRow(
            row,
            userId,
            reason || 'Parent receipt/adjustment cancelled',
            session,
        );
        reversed.push(row);
    }
    return reversed;
}

export async function getCreditNoteAllocationHistory(creditNoteId) {
    return BillWiseAdjustment.find({
        settlementSourceType: 'CreditDebitNote',
        settlementSourceId: creditNoteId,
    })
        .sort({ adjustmentDate: -1 })
        .lean();
}

export async function countActiveCreditNoteAllocations(creditNoteId) {
    return BillWiseAdjustment.countDocuments({
        settlementSourceType: 'CreditDebitNote',
        settlementSourceId: creditNoteId,
        isReversed: { $ne: true },
    });
}
