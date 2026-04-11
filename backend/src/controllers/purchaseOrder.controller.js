import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { Supplier } from '../models/supplier.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AuditLog } from '../models/auditLog.model.js';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import Joi from 'joi';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextNumberFromSeries } from '../utils/numberingUtils.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';

// ── Joi Schemas ────────────────────────────────────────────────────────────────
const poItemSchema = Joi.object({
    itemId: Joi.string().required(),
    itemCode: Joi.string().optional().allow(''),
    itemName: Joi.string().required(),
    description: Joi.string().optional().allow(''),
    hsnCode: Joi.string().optional().allow(''),
    uom: Joi.string().optional().allow(''),
    orderedQty: Joi.number().min(0.01).required(),
    rate: Joi.number().min(0).required(),
    discountPercent: Joi.number().min(0).max(100).default(0),
    taxPercent: Joi.number().min(0).default(0),
    additionalNotes: Joi.string().optional().allow(''),
    componentCategory: Joi.string().optional().allow(''),
    bomRef: Joi.string().optional().allow(''),
});

const createPOSchema = Joi.object({
    poDate: Joi.date().optional().allow(null, ''),
    supplierId: Joi.string().required(),
    supplierInvoiceNo: Joi.string().optional().allow(''),
    invoiceDate: Joi.date().optional().allow(null, ''),
    gstType: Joi.string().valid('CGST / SGST', 'IGST', '').optional().allow(''),
    paymentTerms: Joi.string().optional().allow(''),
    expectedDeliveryDate: Joi.date().optional().allow(null, ''),
    warehouse: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    supplierAddress: Joi.string().optional().allow(''),
    supplierGstNumber: Joi.string().optional().allow(''),
    supplierState: Joi.string().optional().allow(''),
    supplierStateCode: Joi.string().optional().allow(''),
    supplierContact: Joi.string().optional().allow(''),
    deliveryAddress: Joi.string().optional().allow(''),
    deliveryFacility: Joi.string().optional().allow(''),
    transporterName: Joi.string().optional().allow(''),
    vehicleNo: Joi.string().optional().allow(''),
    lrNumber: Joi.string().optional().allow(''),
    freightAmount: Joi.number().min(0).default(0),
    freightGstRate: Joi.number().min(0).default(0),
    complaintId: Joi.string().optional().allow(null, ''),
    complaintNo: Joi.string().optional().allow(''),
    stickerType: Joi.string().optional().allow(''),
    items: Joi.array().items(poItemSchema).min(1).required(),
});

const updatePOSchema = createPOSchema.fork(['supplierId', 'items'], f => f.optional());

// ── Helpers ────────────────────────────────────────────────────────────────────
const generatePoNumber = async () => {
    const year = new Date().getFullYear();
    const lastPO = await PurchaseOrder.findOne({ poNumber: new RegExp(`^PO-${year}-`) }).sort({ poNumber: -1 });
    if (!lastPO) {
        return `PO-${year}-00001`;
    }
    const lastNumber = parseInt(lastPO.poNumber.split('-')[2], 10) || 0;
    return `PO-${year}-${String(lastNumber + 1).padStart(5, '0')}`;
};

const calculateTotals = (items, gstType, freightAmount = 0, freightGstRate = 0) => {
    let subTotal = 0, discountTotal = 0, taxTotal = 0;
    items.forEach(item => {
        const grossAmount = item.orderedQty * item.rate;
        const discAmt = (grossAmount * (item.discountPercent || 0)) / 100;
        const netAmt = grossAmount - discAmt;
        const taxAmt = (netAmt * (item.taxPercent || 0)) / 100;
        item.amount = Math.round(netAmt * 100) / 100;
        item.taxAmount = Math.round(taxAmt * 100) / 100;
        item.totalAmount = Math.round((netAmt + taxAmt) * 100) / 100;
        item.pendingQty = item.orderedQty;
        item.receivedQty = 0;
        subTotal += grossAmount;
        discountTotal += discAmt;
        taxTotal += taxAmt;
    });

    // Handle Freight GST
    const freightTax = (Number(freightAmount || 0) * Number(freightGstRate || 0)) / 100;
    taxTotal += freightTax;

    return {
        subTotal: Math.round(subTotal * 100) / 100,
        discountTotal: Math.round(discountTotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        grandTotal: Math.round((subTotal - discountTotal + taxTotal + Number(freightAmount || 0)) * 100) / 100,
    };
};

// ── Controllers ────────────────────────────────────────────────────────────────
export const createPO = asyncHandler(async (req, res) => {
    const { error, value } = createPOSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    const supplier = await Supplier.findById(value.supplierId);
    if (!supplier) throw new ApiError(404, 'Supplier not found');

    const fy = value.financialYear || getFYFromDate(value.poDate || new Date());

    let poNumber = value.poNumber, sequenceNumber;
    if (!poNumber && value.seriesId) {
        const numbering = await getNextNumberFromSeries(PurchaseOrder, value.seriesId, fy);
        if (numbering) {
            poNumber = numbering.displayInvoiceNumber;
            sequenceNumber = numbering.sequenceNumber;
        }
    }
    
    // Defensive: ensure poNumber is a string
    if (typeof poNumber !== 'string') {
        poNumber = String(poNumber?.displayInvoiceNumber || poNumber || '');
    }
    
    if (!poNumber) {
        poNumber = await generatePoNumber();
    }

    const totals = calculateTotals(value.items, value.gstType, value.freightAmount, value.freightGstRate);

    const po = await PurchaseOrder.create({
        poNumber,
        seriesId: value.seriesId,
        sequenceNumber,
        ...value,
        supplierName: supplier.supplierName,
        supplierAddress: value.supplierAddress || supplier.address,
        supplierGstNumber: value.supplierGstNumber || supplier.gstNumber,
        supplierState: value.supplierState || supplier.state,
        supplierStateCode: value.supplierStateCode || '',
        supplierContact: value.supplierContact || supplier.phone,
        status: 'Ordered',
        financialYear: fy,
        ...totals,
        complaintId: value.complaintId || null,
        complaintNo: value.complaintNo || '',
        createdBy: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, po, 'Purchase Order created'));
});

export const getPOs = asyncHandler(async (req, res) => {
    const { status, supplierId, search, page = 1, limit = 20, includeDeleted, view } = req.query;
    const query = { isDeleted: { $ne: true } };
    
    if (view === 'archived') {
        query.isDeleted = true;
    } else if (view === 'all' || includeDeleted === 'true') {
        delete query.isDeleted;
    }

    if (status) query.status = status;
    if (supplierId) query.supplierId = supplierId;
    if (search) query.$or = [
        { poNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
    ];
    if (req.query.financialYear) query.financialYear = req.query.financialYear;


    const skip = (Number(page) - 1) * Number(limit);
    const total = await PurchaseOrder.countDocuments(query);
    const pos = await PurchaseOrder.find(query)
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('supplierId', 'supplierName supplierCode')
        .populate('createdBy', 'name mobile');


    res.json(new ApiResponse(200, { purchaseOrders: pos, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'POs fetched'));
});

export const getPOById = asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findById(req.params.id)
        .populate('supplierId', 'supplierName supplierCode gstNumber address city state pincode gstType paymentTerms phone email')
        .populate('createdBy', 'name mobile');
    if (!po) throw new ApiError(404, 'Purchase Order not found');
    res.json(new ApiResponse(200, po, 'PO fetched'));
});

export const updatePO = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const po = await PurchaseOrder.findById(req.params.id).session(session);
        if (!po) throw new ApiError(404, 'Purchase Order not found');

        const { error, value } = updatePOSchema.validate(req.body, { allowUnknown: true });
        if (error) throw new ApiError(400, error.details[0].message);

        const auditTrail = {};
        const allowedFields = Object.keys(updatePOSchema.describe().keys);
        
        // Strict Partial Merge
        allowedFields.forEach(key => {
            if (value[key] !== undefined && JSON.stringify(value[key]) !== JSON.stringify(po[key])) {
                auditTrail[key] = { old: po[key], new: value[key] };
                po[key] = value[key];
            }
        });

        if (Object.keys(auditTrail).length > 0) {
            // Recalculate if items or freight changed
            if (auditTrail.items || auditTrail.freightAmount || auditTrail.freightGstRate || auditTrail.gstType) {
                const totals = calculateTotals(po.items, po.gstType, po.freightAmount, po.freightGstRate);
                Object.assign(po, totals);
            }

            po.updatedBy = req.user._id;
            await po.save({ session });

            await AuditLog.create([{
                user: req.user._id,
                action: 'UPDATE',
                module: 'PurchaseOrder',
                resourceId: po._id,
                description: `Updated Purchase Order ${po.poNumber}`,
                details: auditTrail,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            }], { session });
        }

        await session.commitTransaction();
        res.json(new ApiResponse(200, po, 'Purchase Order updated'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const updatePOStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['Draft', 'Ordered', 'Cancelled'];
    if (!validStatuses.includes(status)) throw new ApiError(400, 'Invalid status transition');

    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) throw new ApiError(404, 'PO not found');
    if (po.status === 'Completed') throw new ApiError(400, 'Completed PO cannot be changed');

    po.status = status;
    po.updatedBy = req.user._id;
    await po.save();
    res.json(new ApiResponse(200, po, `PO status updated to ${status}`));
});

export const deletePO = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) throw new ApiError(400, 'Deletion reason is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const po = await PurchaseOrder.findById(req.params.id).session(session);
        if (!po) throw new ApiError(404, 'PO not found');

        const { GRN } = await import('../models/grn.model.js');
        const { PurchaseInvoice } = await import('../models/purchaseInvoice.model.js');
        
        const [hasActiveGRN, hasActivePI] = await Promise.all([
            GRN.exists({ poId: po._id, isDeleted: { $ne: true } }),
            PurchaseInvoice.exists({ poId: po._id, isDeleted: { $ne: true } })
        ]);

        if (hasActiveGRN) throw new ApiError(400, 'Cannot archive Purchase Order – An active GRN is linked to this order.');
        if (hasActivePI) throw new ApiError(400, 'Cannot archive Purchase Order – An active Purchase Invoice is linked to this order.');

        po.isDeleted = true;
        po.deletedAt = new Date();
        po.deletedBy = req.user._id;
        po.deleteReason = reason;
        await po.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'DELETE',
            module: 'PurchaseOrder',
            resourceId: po._id,
            description: `Soft deleted Purchase Order ${po.poNumber}`,
            details: { reason },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json(new ApiResponse(200, null, 'Purchase Order soft-deleted'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const restorePO = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const po = await PurchaseOrder.findById(req.params.id).session(session);
        if (!po) throw new ApiError(404, 'PO not found');
        if (!po.isDeleted) throw new ApiError(400, 'Purchase Order is not deleted');

        po.isDeleted = false;
        po.deletedAt = null;
        po.deletedBy = null;
        await po.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'RESTORE',
            module: 'PurchaseOrder',
            resourceId: po._id,
            description: `Restored Purchase Order ${po.poNumber}`,
            details: { previousReason: po.deleteReason },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json(new ApiResponse(200, po, 'Purchase Order restored'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
