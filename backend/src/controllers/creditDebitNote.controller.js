import mongoose from 'mongoose';
import { CreditDebitNote } from '../models/creditDebitNote.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextNumberFromSeries } from '../utils/numberingUtils.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import httpStatus from 'http-status';
import {
    postCustomerCreditNoteAccounting,
    countActiveCreditNoteAllocations,
    getCreditNoteAvailableBalance,
    getCreditNoteAllocationHistory,
    rebuildCreditNoteAppliedAmount,
    assertBillAdjustmentPermission,
    listAvailableCustomerCreditNotes,
    applyCustomerCreditNoteAllocations,
    reverseCustomerCreditNoteAllocation,
} from '../services/creditNoteAllocation.service.js';

const oid = (v) => {
    if (!v) return '';
    if (typeof v === 'object' && v._id) return String(v._id);
    return String(v);
};

/**
 * Ensure linked original invoice belongs to the same customer/company and is not an Estimate.
 * Does not change GST/accounting posting rules — validation only.
 */
async function assertOriginalInvoiceCustomerMatch(body, companyId) {
    const invoiceId = oid(body.originalInvoiceId);
    if (!invoiceId) return;

    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid original invoice id');
    }

    const inv = await SalesInvoice.findById(invoiceId).populate('seriesId', 'isEstimate documentType seriesName');
    if (!inv || inv.isDeleted) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Original invoice not found or deleted');
    }

    if (companyId && inv.companyId && String(inv.companyId) !== String(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Original invoice belongs to another company');
    }

    const noteCustomerId = oid(body.customerId);
    const invCustomerId = oid(inv.customerId);
    if (!noteCustomerId || !invCustomerId || noteCustomerId !== invCustomerId) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Customer on the Credit/Debit Note must match the selected original invoice customer',
        );
    }

    const series = inv.seriesId;
    if (series?.isEstimate === true || series?.documentType === 'Estimate') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Estimate documents cannot be linked to a Credit/Debit Note');
    }
}

export const createCreditDebitNote = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const body = req.body;
        const companyId = req.companyId || body.companyId || null;
        await assertOriginalInvoiceCustomerMatch(body, companyId);

        const fy = body.financialYear || getFYFromDate(body.noteDate || new Date());

        let noteNumber = body.noteNumber;
        let sequenceNumber = body.sequenceNumber || 0;

        if (!noteNumber && body.seriesId) {
            const numbering = await getNextNumberFromSeries(CreditDebitNote, body.seriesId, fy, session, 'noteNumber');
            if (numbering) {
                sequenceNumber = numbering.sequenceNumber;
                noteNumber = numbering.displayInvoiceNumber;
            }
        }

        if (!noteNumber) {
            noteNumber = `CDN-${Date.now()}`;
        }

        const noteData = {
            ...body,
            noteNumber,
            sequenceNumber,
            financialYear: fy,
            createdBy: req.user.id,
            status: body.status || 'Draft',
            companyId,
            appliedAmount: 0,
        };

        const [note] = await CreditDebitNote.create([noteData], { session });

        await session.commitTransaction();
        res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, note, 'Note created successfully'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const getCreditDebitNotes = asyncHandler(async (req, res) => {
    const { noteType, customerId, status, dateFrom, dateTo, limit = 50, page = 1, search } = req.query;

    const filter = { isDeleted: { $ne: true } };
    if (noteType) filter.noteType = noteType;
    if (customerId) filter.customerId = customerId;
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
        filter.noteDate = {};
        if (dateFrom) filter.noteDate.$gte = new Date(dateFrom);
        if (dateTo) filter.noteDate.$lte = new Date(dateTo);
    }
    if (search) {
        filter.$or = [
            { noteNumber: { $regex: search, $options: 'i' } },
            { customerName: { $regex: search, $options: 'i' } },
        ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [notes, total] = await Promise.all([
        CreditDebitNote.find(filter)
            .populate('customerId', 'customerName')
            .populate('seriesId', 'seriesName')
            .populate('originalInvoiceId', 'invoiceNumber invoiceDate')
            .sort({ noteDate: -1 })
            .skip(skip)
            .limit(Number(limit)),
        CreditDebitNote.countDocuments(filter),
    ]);

    res.json(new ApiResponse(httpStatus.OK, { notes, total }));
});

export const getCreditDebitNoteById = asyncHandler(async (req, res) => {
    const note = await CreditDebitNote.findById(req.params.id)
        .populate('customerId')
        .populate('originalInvoiceId')
        .populate('seriesId')
        .populate('linkedVoucherId', 'voucherNo nature status date totalAmount');
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');

    let balance = null;
    let allocations = [];
    if (note.noteType === 'Credit Note') {
        try {
            assertBillAdjustmentPermission(req.user, 'view');
            balance = await getCreditNoteAvailableBalance(note);
            allocations = await getCreditNoteAllocationHistory(note._id);
        } catch {
            /* view permission optional for basic detail — still return note */
            balance = await getCreditNoteAvailableBalance(note);
            allocations = await getCreditNoteAllocationHistory(note._id);
        }
    }

    res.json(new ApiResponse(httpStatus.OK, {
        ...note.toObject(),
        availableBalance: balance?.availableBalance ?? null,
        derivedAppliedAmount: balance?.appliedAmount ?? note.appliedAmount,
        originalAmount: balance?.originalAmount ?? note.grandTotal,
        allocationHistory: allocations,
        accountingLinkStatus: note.linkedVoucherId ? 'Linked' : 'Not Linked',
    }));
});

export const updateCreditDebitNote = asyncHandler(async (req, res) => {
    const note = await CreditDebitNote.findById(req.params.id);
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
    if (note.status === 'Final' || note.status === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot edit finalized or cancelled notes');
    }

    const body = { ...req.body };
    const companyId = req.companyId || note.companyId || body.companyId || null;
    const mergedForCheck = {
        customerId: body.customerId !== undefined ? body.customerId : note.customerId,
        originalInvoiceId: body.originalInvoiceId !== undefined ? body.originalInvoiceId : note.originalInvoiceId,
    };
    await assertOriginalInvoiceCustomerMatch(mergedForCheck, companyId);

    const updatedNote = await CreditDebitNote.findByIdAndUpdate(
        req.params.id,
        { ...body, updatedBy: req.user.id },
        { new: true },
    );
    res.json(new ApiResponse(httpStatus.OK, updatedNote, 'Note updated successfully'));
});

export const finalizeCreditDebitNote = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const note = await CreditDebitNote.findById(req.params.id).session(session);
        if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
        if (note.status === 'Cancelled') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot finalize a cancelled note');
        }
        if (note.status === 'Final' && note.linkedVoucherId) {
            await session.commitTransaction();
            return res.json(new ApiResponse(httpStatus.OK, note, 'Note already finalized'));
        }

        note.status = 'Final';
        note.updatedBy = req.user.id;
        if (req.companyId && !note.companyId) note.companyId = req.companyId;

        // Phase 4A Option B — Customer Credit Note only; Debit Note unchanged (no GL here).
        if (note.noteType === 'Credit Note') {
            await postCustomerCreditNoteAccounting(note, req.user.id, req.companyId, session);
        } else {
            await note.save({ session });
        }

        await session.commitTransaction();
        const fresh = await CreditDebitNote.findById(note._id)
            .populate('linkedVoucherId', 'voucherNo nature status');
        res.json(new ApiResponse(httpStatus.OK, fresh, 'Note finalized successfully'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const cancelCreditDebitNote = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const note = await CreditDebitNote.findById(req.params.id);
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');

    if (note.noteType === 'Credit Note') {
        const active = await countActiveCreditNoteAllocations(note._id);
        if (active > 0) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                'This Credit Note has been adjusted against one or more Sales Invoices. Reverse the bill allocations before cancelling the Credit Note.',
            );
        }
    }

    note.status = 'Cancelled';
    note.cancelReason = reason;
    note.cancelledAt = new Date();
    note.cancelledBy = req.user.id;
    note.updatedBy = req.user.id;
    await note.save();
    res.json(new ApiResponse(httpStatus.OK, note, 'Note cancelled successfully'));
});

export const deleteCreditDebitNote = asyncHandler(async (req, res) => {
    const note = await CreditDebitNote.findById(req.params.id);
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
    note.isDeleted = true;
    await note.save();
    res.json(new ApiResponse(httpStatus.OK, null, 'Note deleted successfully'));
});

/** GET available Final Customer Credit Notes for a customer (bill adjustment). */
export const getAvailableCustomerCreditNotes = asyncHandler(async (req, res) => {
    assertBillAdjustmentPermission(req.user, 'view');
    const { customerId, financialYear } = req.query;
    if (!customerId) throw new ApiError(httpStatus.BAD_REQUEST, 'customerId is required');
    const notes = await listAvailableCustomerCreditNotes({
        customerId,
        companyId: req.companyId,
        financialYear: financialYear || null,
    });
    res.json(new ApiResponse(httpStatus.OK, notes));
});

/** POST apply CN → SI allocations */
export const applyCreditNoteAllocations = asyncHandler(async (req, res) => {
    const { lines, remarks, sourceMode, parentReceiptVoucherId } = req.body;
    const created = await applyCustomerCreditNoteAllocations({
        lines,
        userId: req.user.id || req.user._id,
        companyId: req.companyId,
        sourceMode: sourceMode || 'BillWisePage',
        parentReceiptVoucherId: parentReceiptVoucherId || null,
        remarks: remarks || '',
        user: req.user,
    });
    res.status(httpStatus.CREATED).json(
        new ApiResponse(httpStatus.CREATED, { count: created.length, allocations: created }, 'Credit Note allocated'),
    );
});

/** POST reverse a CN allocation */
export const reverseCreditNoteAllocation = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const row = await reverseCustomerCreditNoteAllocation(
        req.params.id,
        req.user.id || req.user._id,
        reason,
        req.user,
    );
    res.json(new ApiResponse(httpStatus.OK, row, 'Allocation reversed'));
});

/** Rebuild cached appliedAmount from allocations */
export const rebuildCreditNoteBalance = asyncHandler(async (req, res) => {
    assertBillAdjustmentPermission(req.user, 'view');
    const applied = await rebuildCreditNoteAppliedAmount(req.params.id);
    const note = await CreditDebitNote.findById(req.params.id);
    const bal = await getCreditNoteAvailableBalance(note);
    res.json(new ApiResponse(httpStatus.OK, { appliedAmount: applied, ...bal }));
});
