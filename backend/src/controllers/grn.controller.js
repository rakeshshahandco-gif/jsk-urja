import { GRN } from '../models/grn.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import mongoose from 'mongoose';
import Joi from 'joi';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextNumberFromSeries } from '../utils/numberingUtils.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';

// ── Auto-generate GRN Number ──────────────────────────────────────────────────
const generateGrnNumber = async () => {
    const count = await GRN.countDocuments();
    const year = new Date().getFullYear();
    return `GRN-${year}-${String(count + 1).padStart(5, '0')}`;
};

// ── Stock helper ──────────────────────────────────────────────────────────────
export const updateStockForItems = async (items, refNo, refId, refType, userId, session, financialYear) => {
    const ledgerEntries = [];
    for (const item of items) {
        const inventoryItem = await Item.findById(item.itemId).session(session);
        if (!inventoryItem) continue;

        const oldStock = inventoryItem.currentStock || 0;
        const oldRate = inventoryItem.valuationRate || 0;
        const newQty = item.receivedQty || item.qty;
        const newRate = item.rate;

        const totalOldValue = oldStock * oldRate;
        const totalNewValue = newQty * newRate;
        const newAvgRate = (oldStock + newQty) > 0
            ? Math.round(((totalOldValue + totalNewValue) / (oldStock + newQty)) * 100) / 100
            : newRate;

        inventoryItem.currentStock = oldStock + newQty;
        inventoryItem.valuationRate = newAvgRate;
        await inventoryItem.save({ session });

        ledgerEntries.push({
            date: new Date(),
            itemId: item.itemId,
            itemCode: item.itemCode || '',
            itemName: item.itemName,
            transactionType: refType,
            referenceNo: refNo,
            referenceId: refId,
            inQty: newQty,
            outQty: 0,
            rate: newRate,
            amount: Math.round(newQty * newRate * 100) / 100,
            runningStock: inventoryItem.currentStock,
            warehouse: item.warehouse || '',
            remarks: `${refType}: ${refNo}`,
            financialYear: financialYear || getFYFromDate(new Date()),
            createdBy: userId,
        });
    }
    if (ledgerEntries.length > 0) await StockLedger.insertMany(ledgerEntries, { session });
};

// ── Joi Schemas ───────────────────────────────────────────────────────────────
const grnItemAgainstPO = Joi.object({
    poItemId: Joi.string().required(),
    receivedQty: Joi.number().min(0.01).required(),
    qcStatus: Joi.string().valid('Pending', 'Accepted', 'Rejected', 'Hold').default('Accepted'),
    batchNo: Joi.string().optional().allow(''),
    serialNo: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
});

const grnItemDirect = Joi.object({
    itemId: Joi.string().required(),
    itemCode: Joi.string().optional().allow(''),
    itemName: Joi.string().required(),
    hsnCode: Joi.string().optional().allow(''),
    uom: Joi.string().optional().allow(''),
    receivedQty: Joi.number().min(0.01).required(),
    rate: Joi.number().min(0).required(),
    qcStatus: Joi.string().valid('Pending', 'Accepted', 'Rejected', 'Hold').default('Accepted'),
    batchNo: Joi.string().optional().allow(''),
    serialNo: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
});

const createGRNAgainstPOSchema = Joi.object({
    sourceType: Joi.string().valid('Against PO').required(),
    poId: Joi.string().required(),
    grnDate: Joi.date().optional(),
    warehouse: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    complaintId: Joi.string().optional().allow(null, ''),
    complaintNo: Joi.string().optional().allow(''),
    items: Joi.array().items(grnItemAgainstPO).min(1).required(),
});

const createDirectGRNSchema = Joi.object({
    sourceType: Joi.string().valid('Direct GRN').required(),
    supplierId: Joi.string().required(),
    grnDate: Joi.date().optional(),
    warehouse: Joi.string().optional().allow(''),
    remarks: Joi.string().optional().allow(''),
    complaintId: Joi.string().optional().allow(null, ''),
    complaintNo: Joi.string().optional().allow(''),
    items: Joi.array().items(grnItemDirect).min(1).required(),
});

// ── POST /grns – Create GRN (Against PO or Direct) ───────────────────────────
export const createGRN = asyncHandler(async (req, res) => {
    const { sourceType } = req.body;

    if (sourceType === 'Direct GRN') {
        return createDirectGRN(req, res);
    }
    return createGRNAgainstPO(req, res);
});

// Flow A & standard: GRN against a PO
const createGRNAgainstPO = async (req, res) => {
    const { error, value } = createGRNAgainstPOSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const po = await PurchaseOrder.findById(value.poId).session(session);
        if (!po) throw new ApiError(404, 'Purchase Order not found');
        if (po.status === 'Cancelled') throw new ApiError(400, 'Cannot receive against a Cancelled PO');
        if (po.status === 'Fully Received' || po.status === 'Closed') throw new ApiError(400, 'PO is already fully received');

        const grnItems = [];
        for (const grnItem of value.items) {
            const poItem = po.items.id(grnItem.poItemId);
            if (!poItem) throw new ApiError(404, `PO item not found: ${grnItem.poItemId}`);
            if (grnItem.receivedQty > poItem.pendingQty) {
                throw new ApiError(400, `Received Qty (${grnItem.receivedQty}) for "${poItem.itemName}" exceeds Pending Qty (${poItem.pendingQty})`);
            }
            grnItems.push({
                itemId: poItem.itemId,
                poItemId: poItem._id,
                itemCode: poItem.itemCode,
                itemName: poItem.itemName,
                hsnCode: poItem.hsnCode || '',
                uom: poItem.uom,
                orderedQty: poItem.orderedQty,
                previouslyReceivedQty: poItem.receivedQty,
                pendingQty: poItem.pendingQty,
                receivedQty: grnItem.receivedQty,
                rate: poItem.rate,
                amount: Math.round(grnItem.receivedQty * poItem.rate * 100) / 100,
                remarks: grnItem.remarks || '',
                discountPercent: poItem.discountPercent || 0,
                taxPercent: poItem.taxPercent || 0,
            });
        }

        const fy = value.financialYear || getFYFromDate(value.grnDate || new Date());
        let grnNumber = value.grnNumber;
        if (!grnNumber && value.seriesId) {
            grnNumber = await getNextNumberFromSeries(value.seriesId, session);
        }

        if (!grnNumber) {
            grnNumber = await generateGrnNumber();
        }

        const grn = await GRN.create([{
            grnNumber,
            grnDate: value.grnDate || new Date(),
            poId: po._id,
            poNumber: po.poNumber,
            supplierId: po.supplierId,
            supplierName: po.supplierName,
            warehouse: value.warehouse || po.warehouse || '',
            supplierGstNumber: po.supplierGstNumber || '',
            supplierAddress: po.supplierAddress || '',
            gstType: po.gstType || 'CGST / SGST',
            transporterName: po.transporterName || '',
            vehicleNo: po.vehicleNo || '',
            lrNumber: po.lrNumber || '',
            freightAmount: po.freightAmount || 0,
            freightGstRate: po.freightGstRate || 0,
            sourceType: 'Against PO',
            status: 'Confirmed',
            items: grnItems,
            totalAmount: Math.round(grnItems.reduce((s, i) => s + i.amount, 0) * 100) / 100,
            remarks: value.remarks || '',
            complaintId: value.complaintId || po.complaintId || null,
            complaintNo: value.complaintNo || po.complaintNo || '',
            financialYear: fy,
            createdBy: req.user._id,
        }], { session });

        const createdGrn = grn[0];

        // Update PO item quantities
        let allReceived = true;
        for (const grnItem of grnItems) {
            const poItem = po.items.id(grnItem.poItemId);
            poItem.receivedQty += grnItem.receivedQty;
            poItem.pendingQty = poItem.orderedQty - poItem.receivedQty;
            if (poItem.pendingQty > 0) allReceived = false;
            poItem.isRateEditable = false;
        }
        po.status = allReceived ? 'Fully Received' : 'Partially Received';
        po.updatedBy = req.user._id;
        await po.save({ session });

        // Update stock
        await updateStockForItems(grnItems, createdGrn.grnNumber, createdGrn._id, 'GRN', req.user._id, session, fy);

        await AuditLog.create([{
            user: req.user._id,
            action: 'CREATE',
            module: 'GRN',
            resourceId: createdGrn._id,
            description: `Created GRN ${createdGrn.grnNumber} against PO ${po.poNumber}`,
            details: { items: grnItems.length, total: createdGrn.totalAmount },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.status(201).json(new ApiResponse(201, createdGrn, `GRN ${createdGrn.grnNumber} created. Stock updated.`));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

// Flow C: Direct GRN without PO
const createDirectGRN = async (req, res) => {
    const { error, value } = createDirectGRNSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const supplier = await Supplier.findById(value.supplierId).session(session);
        if (!supplier) throw new ApiError(404, 'Supplier not found');

        const grnItems = value.items.map(item => ({
            itemId: item.itemId,
            poItemId: null,
            itemCode: item.itemCode || '',
            itemName: item.itemName,
            hsnCode: item.hsnCode || '',
            uom: item.uom || 'NOS',
            orderedQty: 0,
            previouslyReceivedQty: 0,
            pendingQty: 0,
            receivedQty: item.receivedQty,
            rate: item.rate,
            amount: Math.round(item.receivedQty * item.rate * 100) / 100,
            qcStatus: item.qcStatus || 'Accepted',
            batchNo: item.batchNo || '',
            serialNo: item.serialNo || '',
            remarks: item.remarks || '',
        }));

        const fy = value.financialYear || getFYFromDate(value.grnDate || new Date());
        let grnNumber = value.grnNumber;
        if (!grnNumber && value.seriesId) {
            grnNumber = await getNextNumberFromSeries(value.seriesId, session);
        }

        if (!grnNumber) {
            grnNumber = await generateGrnNumber();
        }

        const grn = await GRN.create([{
            grnNumber,
            grnDate: value.grnDate || new Date(),
            poId: null,
            poNumber: '',
            supplierId: supplier._id,
            supplierName: supplier.supplierName,
            warehouse: value.warehouse || '',
            sourceType: 'Direct GRN',
            status: 'Confirmed',
            items: grnItems,
            totalAmount: Math.round(grnItems.reduce((s, i) => s + i.amount, 0) * 100) / 100,
            remarks: value.remarks || '',
            complaintId: value.complaintId || null,
            complaintNo: value.complaintNo || '',
            financialYear: fy,
            createdBy: req.user._id,
        }], { session });

        const createdGrn = grn[0];

        // Update stock immediately on Direct GRN
        await updateStockForItems(grnItems, createdGrn.grnNumber, createdGrn._id, 'GRN', req.user._id, session, fy);

        await AuditLog.create([{
            user: req.user._id,
            action: 'CREATE',
            module: 'GRN',
            resourceId: createdGrn._id,
            description: `Created Direct GRN ${createdGrn.grnNumber}`,
            details: { items: grnItems.length, total: createdGrn.totalAmount },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.status(201).json(new ApiResponse(201, createdGrn, `Direct GRN ${createdGrn.grnNumber} created. Stock updated.`));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

// ── GET /grns – List GRNs ──────────────────────────────────────────────────────
export const getGRNs = asyncHandler(async (req, res) => {
    const { poId, supplierId, invoiceStatus, search, page = 1, limit = 30, includeDeleted, view } = req.query;
    const query = { isDeleted: { $ne: true } };
    
    if (view === 'archived') {
        query.isDeleted = true;
    } else if (view === 'all' || includeDeleted === 'true') {
        delete query.isDeleted;
    }

    if (poId) query.poId = poId;
    if (supplierId) query.supplierId = supplierId;
    if (invoiceStatus) query.invoiceStatus = invoiceStatus;
    if (search) query.$or = [
        { grnNumber: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { poNumber: { $regex: search, $options: 'i' } },
    ];
    if (req.query.financialYear) query.financialYear = req.query.financialYear;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await GRN.countDocuments(query);
    const grns = await GRN.find(query)
        .sort({ grnDate: -1 }).skip(skip).limit(Number(limit))
        .populate('supplierId', 'supplierName supplierCode')
        .populate('poId', 'poNumber');

    res.json(new ApiResponse(200, { grns, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'GRNs fetched'));
});

export const updateGRN = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const grn = await GRN.findById(req.params.id).session(session);
        if (!grn) throw new ApiError(404, 'GRN not found');
        if (grn.isDeleted) throw new ApiError(400, 'Cannot edit a deleted GRN');

        const auditTrail = {};
        const updateData = req.body;
        
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && JSON.stringify(grn[key]) !== JSON.stringify(updateData[key])) {
                auditTrail[key] = { old: grn[key], new: updateData[key] };
                grn[key] = updateData[key];
            }
        });

        if (Object.keys(auditTrail).length > 0) {
            grn.updatedBy = req.user._id;
            await grn.save({ session });

            await AuditLog.create([{
                user: req.user._id,
                action: 'UPDATE',
                module: 'GRN',
                resourceId: grn._id,
                description: `Updated GRN ${grn.grnNumber}`,
                details: auditTrail,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            }], { session });
        }

        await session.commitTransaction();
        res.json(new ApiResponse(200, grn, 'GRN updated'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// ── GET /grns/:id ─────────────────────────────────────────────────────────────
export const getGRNById = asyncHandler(async (req, res) => {
    const grn = await GRN.findById(req.params.id)
        .populate('supplierId', 'supplierName supplierCode gstNumber')
        .populate('poId', 'poNumber')
        .populate('createdBy', 'name');
    if (!grn) throw new ApiError(404, 'GRN not found');
    res.json(new ApiResponse(200, grn, 'GRN fetched'));
});

// ── GET /grns/by-po/:poId ─────────────────────────────────────────────────────
export const getGRNsByPO = asyncHandler(async (req, res) => {
    const grns = await GRN.find({ poId: req.params.poId }).sort({ createdAt: -1 });
    res.json(new ApiResponse(200, grns, 'GRNs for this PO'));
});

// ── GET /grns/by-supplier/:supplierId (for Direct GRN invoicing) ─────────────
export const getGRNsBySupplier = asyncHandler(async (req, res) => {
    const grns = await GRN.find({
        supplierId: req.params.supplierId,
        invoiceStatus: { $ne: 'Fully Invoiced' },
        status: 'Confirmed',
    }).sort({ createdAt: -1 }).select('grnNumber grnDate sourceType items totalAmount invoiceStatus poNumber');
    res.json(new ApiResponse(200, grns, 'GRNs for supplier'));
});

export const deleteGRN = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) throw new ApiError(400, 'Deletion reason is required');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const grn = await GRN.findById(req.params.id).session(session);
        if (!grn) throw new ApiError(404, 'GRN not found');
        if (grn.invoiceStatus === 'Fully Invoiced' || grn.invoiceStatus === 'Partially Invoiced')
            throw new ApiError(400, 'Cannot delete GRN – Invoices already created against this GRN');

        // Soft delete logic
        grn.isDeleted = true;
        grn.deletedAt = new Date();
        grn.deletedBy = req.user._id;
        grn.deleteReason = reason;

        await rollbackSideEffects(grn, req.user._id, session);
        await grn.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'DELETE',
            module: 'GRN',
            resourceId: grn._id,
            description: `Soft deleted GRN ${grn.grnNumber}`,
            details: { reason },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json(new ApiResponse(200, null, 'GRN soft-deleted'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const restoreGRN = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const grn = await GRN.findById(req.params.id).session(session);
        if (!grn) throw new ApiError(404, 'GRN not found');
        if (!grn.isDeleted) throw new ApiError(400, 'GRN is not deleted');

        grn.isDeleted = false;
        grn.deletedAt = null;
        grn.deletedBy = null;
        await grn.save({ session });

        await AuditLog.create([{
            user: req.user._id,
            action: 'RESTORE',
            module: 'GRN',
            resourceId: grn._id,
            description: `Restored GRN ${grn.grnNumber}`,
            details: { previousReason: grn.deleteReason },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        }], { session });

        await session.commitTransaction();
        res.json(new ApiResponse(200, grn, 'GRN restored'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

async function rollbackSideEffects(grn, userId, session) {
    if (grn.poId) {
        const po = await PurchaseOrder.findById(grn.poId).session(session);
        if (po) {
            for (const grnItem of grn.items) {
                const poItem = po.items.id(grnItem.poItemId);
                if (poItem) {
                    poItem.receivedQty = Math.max(0, poItem.receivedQty - grnItem.receivedQty);
                    poItem.pendingQty = poItem.orderedQty - poItem.receivedQty;
                }
            }
            const someReceived = po.items.some(pi => pi.receivedQty > 0);
            po.status = someReceived ? 'Partially Received' : 'Ordered';
            po.updatedBy = userId;
            await po.save({ session });
        }
    }
    for (const item of grn.items) {
        const inventoryItem = await Item.findById(item.itemId).session(session);
        if (inventoryItem) {
            inventoryItem.currentStock = Math.max(0, (inventoryItem.currentStock || 0) - item.receivedQty);
            await inventoryItem.save({ session });
        }
    }
    await StockLedger.deleteMany({ referenceId: grn._id }).session(session);
}
