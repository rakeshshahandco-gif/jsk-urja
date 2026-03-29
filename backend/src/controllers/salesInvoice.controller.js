import mongoose from 'mongoose';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { rollbackStockLedger, recalculateStockLedger } from '../utils/stockUtils.js';
import { Item } from '../models/item.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { postSalesInvoiceToLedger, reverseInvoiceLedgerImpact } from '../utils/ledgerDispatcher.js';
import httpStatus from 'http-status';

export const createSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const body = req.body;
        const invoiceNumber = body.invoiceNumber || `SI-${Date.now()}`;
        
        const invData = {
            ...body,
            invoiceNumber,
            createdBy: req.user.id,
            status: 'Confirmed',
            paymentStatus: 'Unpaid'
        };

        const [invoice] = await SalesInvoice.create([invData], { session });

        // Stock and Ledger Logic
        if (invoice.items && invoice.items.length > 0) {
            for (const iItem of invoice.items) {
                if (!iItem.itemId) continue;
                const itemDoc = await Item.findById(iItem.itemId).session(session);
                if (itemDoc) {
                    itemDoc.currentStock = (itemDoc.currentStock || 0) - iItem.qty;
                    await itemDoc.save({ session });

                    await StockLedger.create([{
                        date: invoice.invoiceDate || new Date(),
                        itemId: itemDoc._id,
                        itemCode: itemDoc.itemCode,
                        itemName: itemDoc.itemName,
                        transactionType: 'SALES_INVOICE',
                        stockBucket: 'SALEABLE',
                        referenceNo: invoice.invoiceNumber,
                        referenceId: invoice._id,
                        outQty: iItem.qty,
                        rate: iItem.rate,
                        amount: iItem.qty * iItem.rate,
                        runningStock: itemDoc.currentStock,
                        createdBy: req.user.id
                    }], { session });
                }
            }
        }

        // Financial Ledger Posting
        try {
            await postSalesInvoiceToLedger(invoice, req.user.id, session);
        } catch (ledgerErr) {
            console.warn(`[Ledger] Could not post invoice ${invoice.invoiceNumber}: ${ledgerErr.message}`);
        }

        if (body.soId) {
            await SalesOrder.findByIdAndUpdate(body.soId, { status: 'Invoiced', invoiceId: invoice._id }).session(session);
        }

        await session.commitTransaction();
        res.status(httpStatus.CREATED).json({ success: true, data: invoice });

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const getSalesInvoices = asyncHandler(async (req, res) => {
    const { search, paymentStatus, paymentType, dateFrom, dateTo, limit = 50, page = 1, includeDeleted, view } = req.query;
    const filter = { isDeleted: { $ne: true } };

    if (view === 'archived') {
        filter.isDeleted = true;
    } else if (view === 'all' || includeDeleted === 'true') {
        delete filter.isDeleted;
    }
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentType) filter.paymentType = paymentType;
    if (search) filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
    ];
    if (dateFrom || dateTo) {
        filter.invoiceDate = {};
        if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom);
        if (dateTo) filter.invoiceDate.$lte = new Date(dateTo);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
        SalesInvoice.find(filter).populate('createdBy', 'name mobile').sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)),
        SalesInvoice.countDocuments(filter),
    ]);
    res.json({ success: true, invoices, total });
});

export const getSalesInvoiceById = asyncHandler(async (req, res) => {
    const inv = await SalesInvoice.findById(req.params.id)
        .populate('seriesId')
        .populate('createdBy', 'name mobile');
        
    if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Sales Invoice not found');
    
    let ledger = await AccountLedger.findOne({ 
        referenceId: inv.customerId, 
        referenceModel: 'Customer' 
    });

    const data = inv.toObject();
    if (ledger) {
        data.customerLedgerId = ledger._id;
        data.customerLedgerName = ledger.name;
    }

    res.json({ success: true, data });
});

export const recordPayment = asyncHandler(async (req, res) => {
    const inv = await SalesInvoice.findById(req.params.id);
    if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
    if (inv.status === 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot pay a cancelled invoice');

    const { amountPaid, paymentDate, paymentMode, reference, remarks } = req.body;
    const amt = Number(amountPaid);
    if (!amt || amt <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Amount must be positive');

    inv.payments.push({ amountPaid: amt, paymentDate: paymentDate || new Date(), paymentMode: paymentMode || 'Cash', reference: reference || '', remarks: remarks || '', recordedBy: req.user.id });
    inv.paidAmount = Math.round((inv.paidAmount + amt) * 100) / 100;

    if (inv.paidAmount >= inv.roundedTotal) inv.paymentStatus = 'Paid';
    else if (inv.paidAmount > 0) inv.paymentStatus = 'Partially Paid';

    inv.updatedBy = req.user.id;
    await inv.save();
    res.json({ success: true, data: inv });
});

export const restoreSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        if (inv.status !== 'Cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice is not cancelled');

        inv.status = 'Confirmed';
        inv.paymentStatus = 'Unpaid';
        inv.updatedBy = req.user.id;
        
        // Re-create stock ledger entries
        if (inv.items && inv.items.length > 0) {
            for (const iItem of inv.items) {
                if (!iItem.itemId) continue;
                const itemDoc = await Item.findById(iItem.itemId).session(session);
                if (itemDoc) {
                    itemDoc.currentStock = (itemDoc.currentStock || 0) - iItem.qty;
                    await itemDoc.save({ session });

                    await StockLedger.create([{
                        date: inv.invoiceDate || new Date(),
                        itemId: itemDoc._id,
                        itemCode: itemDoc.itemCode,
                        itemName: itemDoc.itemName,
                        transactionType: 'SALES_INVOICE',
                        stockBucket: 'SALEABLE',
                        referenceNo: inv.invoiceNumber,
                        referenceId: inv._id,
                        outQty: iItem.qty,
                        rate: iItem.rate,
                        amount: iItem.qty * iItem.rate,
                        createdBy: req.user.id
                    }], { session });

                    await recalculateStockLedger(itemDoc._id, session);
                }
            }
        }

        await postSalesInvoiceToLedger(inv, req.user.id, session);
        await inv.save({ session });
        await session.commitTransaction();
        res.json({ success: true, data: inv });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const cancelSalesInvoice = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        if (inv.paidAmount > 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel with payments');
        
        inv.status = 'Cancelled';
        inv.paymentStatus = 'Cancelled';
        inv.updatedBy = req.user.id;
        await inv.save({ session });

        // Hard rollback stock ledger (hides entry from movement history)
        await rollbackStockLedger(inv._id, session);

        // Reverse Financial Impact
        await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);

        await session.commitTransaction();
        res.json({ success: true, data: inv });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const deleteSalesInvoice = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) throw new ApiError(httpStatus.BAD_REQUEST, 'Deletion reason is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await SalesInvoice.findById(req.params.id).session(session);
        if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
        
        // Restriction: Cannot delete if payments exist
        if (inv.paidAmount > 0 || (inv.payments && inv.payments.length > 0)) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Cannot archive Sales Invoice ${inv.invoiceNumber} because payments have already been recorded against it. Please delete the payments first if you must archive this invoice.`);
        }

        inv.isDeleted = true;
        inv.deletedAt = new Date();
        inv.deletedBy = req.user.id;
        inv.deleteReason = reason;
        inv.status = 'Cancelled'; // Standard archival state

        // Rollback stock and ledger impact
        await rollbackStockLedger(inv._id, session);
        await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);

        await inv.save({ session });
        
        await AuditLog.create([{
            user: req.user.id,
            action: 'DELETE',
            module: 'SalesInvoice',
            resourceId: inv._id,
            description: `Soft Deleted Sales Invoice ${inv.invoiceNumber}`,
            details: { reason },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json({ success: true, message: 'Sales Invoice archived successfully' });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
