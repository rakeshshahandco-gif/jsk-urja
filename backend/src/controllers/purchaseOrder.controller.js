import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { Supplier } from '../models/supplier.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

// ── Joi Schemas ────────────────────────────────────────────────────────────────
const poItemSchema = Joi.object({
    itemId: Joi.string().required(),
    itemCode: Joi.string().optional().allow(''),
    itemName: Joi.string().required(),
    description: Joi.string().optional().allow(''),
    uom: Joi.string().optional().allow(''),
    orderedQty: Joi.number().min(0.01).required(),
    rate: Joi.number().min(0).required(),
    discountPercent: Joi.number().min(0).max(100).default(0),
    taxPercent: Joi.number().min(0).default(0),
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
    transporterName: Joi.string().optional().allow(''),
    vehicleNo: Joi.string().optional().allow(''),
    lrNumber: Joi.string().optional().allow(''),
    freightAmount: Joi.number().min(0).default(0),
    freightGstRate: Joi.number().min(0).default(0),
    items: Joi.array().items(poItemSchema).min(1).required(),
});

const updatePOSchema = createPOSchema.fork(['supplierId', 'items'], f => f.optional());

// ── Helpers ────────────────────────────────────────────────────────────────────
const generatePoNumber = async () => {
    const count = await PurchaseOrder.countDocuments();
    const year = new Date().getFullYear();
    return `PO-${year}-${String(count + 1).padStart(5, '0')}`;
};

const calculateTotals = (items, gstType) => {
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
    return {
        subTotal: Math.round(subTotal * 100) / 100,
        discountTotal: Math.round(discountTotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        grandTotal: Math.round((subTotal - discountTotal + taxTotal) * 100) / 100,
    };
};

// ── Controllers ────────────────────────────────────────────────────────────────
export const createPO = asyncHandler(async (req, res) => {
    const { error, value } = createPOSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    const supplier = await Supplier.findById(value.supplierId);
    if (!supplier) throw new ApiError(404, 'Supplier not found');

    const poNumber = await generatePoNumber();
    const totals = calculateTotals(value.items, value.gstType);

    const po = await PurchaseOrder.create({
        poNumber,
        ...value,
        supplierName: supplier.supplierName,
        status: 'Ordered',
        ...totals,
        createdBy: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, po, 'Purchase Order created'));
});

export const getPOs = asyncHandler(async (req, res) => {
    const { status, supplierId, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (supplierId) query.supplierId = supplierId;
    if (search) query.$or = [
        { poNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
    ];

    const skip = (Number(page) - 1) * Number(limit);
    const total = await PurchaseOrder.countDocuments(query);
    const pos = await PurchaseOrder.find(query)
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('supplierId', 'supplierName supplierCode')
        .populate('createdBy', 'name');

    res.json(new ApiResponse(200, { purchaseOrders: pos, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'POs fetched'));
});

export const getPOById = asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findById(req.params.id)
        .populate('supplierId', 'supplierName supplierCode gstType paymentTerms')
        .populate('createdBy', 'name');
    if (!po) throw new ApiError(404, 'Purchase Order not found');
    res.json(new ApiResponse(200, po, 'PO fetched'));
});

export const updatePO = asyncHandler(async (req, res) => {
    const { error, value } = updatePOSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) throw new ApiError(404, 'Purchase Order not found');
    if (['Completed', 'Cancelled'].includes(po.status))
        throw new ApiError(400, `Cannot edit a ${po.status} Purchase Order`);

    // Cannot edit if GRN exists (rate lock)
    const { GRN } = await import('../models/grn.model.js');
    const hasGRN = await GRN.exists({ poId: po._id });
    if (hasGRN && value.items) {
        // Allow status/header updates, but block item modifications
        delete value.items;
    }

    if (value.items) {
        const totals = calculateTotals(value.items, value.gstType || po.gstType);
        Object.assign(po, value, totals);
    } else {
        Object.assign(po, value);
    }

    po.updatedBy = req.user._id;
    await po.save();
    res.json(new ApiResponse(200, po, 'Purchase Order updated'));
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
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) throw new ApiError(404, 'PO not found');
    if (po.status !== 'Draft' && po.status !== 'Ordered')
        throw new ApiError(400, 'Only Draft or Ordered POs can be deleted');

    const { GRN } = await import('../models/grn.model.js');
    const hasGRN = await GRN.exists({ poId: po._id });
    if (hasGRN) throw new ApiError(400, 'Cannot delete PO – GRN already created against this order');

    await PurchaseOrder.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'Purchase Order deleted'));
});
