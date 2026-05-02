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

export const createCreditDebitNote = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const body = req.body;
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
            status: body.status || 'Draft'
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
            { customerName: { $regex: search, $options: 'i' } }
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
        CreditDebitNote.countDocuments(filter)
    ]);

    res.json(new ApiResponse(httpStatus.OK, { notes, total }));
});

export const getCreditDebitNoteById = asyncHandler(async (req, res) => {
    const note = await CreditDebitNote.findById(req.params.id)
        .populate('customerId')
        .populate('originalInvoiceId')
        .populate('seriesId');
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
    res.json(new ApiResponse(httpStatus.OK, note));
});

export const updateCreditDebitNote = asyncHandler(async (req, res) => {
    const note = await CreditDebitNote.findById(req.params.id);
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
    if (note.status === 'Final' || note.status === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot edit finalized or cancelled notes');
    }

    const updatedNote = await CreditDebitNote.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedBy: req.user.id },
        { new: true }
    );
    res.json(new ApiResponse(httpStatus.OK, updatedNote, 'Note updated successfully'));
});

export const finalizeCreditDebitNote = asyncHandler(async (req, res) => {
    const note = await CreditDebitNote.findById(req.params.id);
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
    note.status = 'Final';
    note.updatedBy = req.user.id;
    await note.save();
    res.json(new ApiResponse(httpStatus.OK, note, 'Note finalized successfully'));
});

export const cancelCreditDebitNote = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const note = await CreditDebitNote.findById(req.params.id);
    if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
    
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
