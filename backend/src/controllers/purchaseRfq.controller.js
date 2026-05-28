import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { PurchaseRfq } from '../models/purchaseRfq.model.js';
import { SupplierQuotation } from '../models/supplierQuotation.model.js';
import { Supplier } from '../models/supplier.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { checkUserPermission } from '../utils/permissionUtils.js';
import {
    generateRfqNumber,
    enrichRfqItems,
    calcQuotationItems,
    convertRfqToPurchaseOrders,
    buildComparisonMatrix,
} from '../services/purchaseRfq.service.js';

function assertPerm(user, key) {
    const role = (user?.role?.name || user?.roleName || '').toLowerCase();
    if (role === 'admin' || role === 'superadmin') return;
    if (!checkUserPermission(user, key)) {
        throw new ApiError(httpStatus.FORBIDDEN, `Permission denied: ${key}`);
    }
}

async function logAudit(user, action, module, resourceId, description, details, req) {
    await AuditLog.create([{
        user: user.id || user._id,
        action,
        module,
        resourceId,
        description,
        details,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
    }]);
}

function snapshotRequester(user) {
    const dept = user?.department;
    return {
        requestedBy: user?.name || '',
        requestedByUserId: user?._id || user?.id || null,
        requestedByPhone: user?.mobile || '',
        requestedByEmail: user?.email || '',
        department: (typeof dept === 'object' && dept?.name) ? dept.name : (dept || ''),
    };
}

async function snapshotSuppliers(supplierIds) {
    const suppliers = [];
    for (const sid of supplierIds) {
        const s = await Supplier.findById(sid);
        if (!s) continue;
        suppliers.push({
            supplierId: s._id,
            supplierName: s.supplierName,
            contactPerson: s.contactPerson || '',
            mobile: s.phone || '',
            email: s.email || '',
            whatsApp: s.whatsApp || s.phone || '',
            gstin: s.gstNumber || '',
            city: s.city || '',
            previousPurchaseNote: '',
        });
    }
    return suppliers;
}

export const listPurchaseRfqs = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.view');
    const { search, status, supplierId, item, converted, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (req.companyId) filter.companyId = req.companyId;
    if (status) filter.status = status;
    if (converted === 'true') filter.status = 'Converted to PO';
    if (converted === 'false') filter.status = { $ne: 'Converted to PO' };
    if (dateFrom || dateTo) {
        filter.rfqDate = {};
        if (dateFrom) filter.rfqDate.$gte = new Date(dateFrom);
        if (dateTo) filter.rfqDate.$lte = new Date(dateTo);
    }
    if (search) {
        filter.$or = [
            { rfqNumber: { $regex: search, $options: 'i' } },
            { requestedBy: { $regex: search, $options: 'i' } },
            { 'items.itemName': { $regex: search, $options: 'i' } },
            { 'items.itemCode': { $regex: search, $options: 'i' } },
        ];
    }
    if (supplierId) filter['suppliers.supplierId'] = supplierId;
    if (item) {
        filter.$and = filter.$and || [];
        filter.$and.push({
            $or: [
                { 'items.itemName': { $regex: item, $options: 'i' } },
                { 'items.itemCode': { $regex: item, $options: 'i' } },
            ],
        });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [rfqs, total] = await Promise.all([
        PurchaseRfq.find(filter).sort({ rfqDate: -1 }).skip(skip).limit(Number(limit)),
        PurchaseRfq.countDocuments(filter),
    ]);
    res.json(new ApiResponse(200, { rfqs, total, page: Number(page) }, 'RFQs fetched'));
});

export const getPurchaseRfqById = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.view');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    const quotations = await SupplierQuotation.find({ rfqId: rfq._id, isDeleted: { $ne: true } });
    res.json(new ApiResponse(200, { rfq, quotations }, 'RFQ fetched'));
});

export const createPurchaseRfq = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.add');
    const body = req.body;
    if (!body.items?.length) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one item is required');

    const fy = body.financialYear || getFYFromDate(body.rfqDate || new Date());
    const rfqNumber = body.rfqNumber || await generateRfqNumber(fy);
    const items = await enrichRfqItems(body.items);
    const supplierIds = body.supplierIds || (body.suppliers || []).map((s) => s.supplierId);
    const suppliers = supplierIds.length
        ? (body.suppliers?.length ? body.suppliers : await snapshotSuppliers(supplierIds))
        : [];
    const requester = snapshotRequester(req.user);

    const rfq = await PurchaseRfq.create({
        rfqNumber,
        rfqDate: body.rfqDate || new Date(),
        requiredByDate: body.requiredByDate || null,
        department: body.department || requester.department,
        requestedBy: body.requestedBy || requester.requestedBy,
        requestedByUserId: requester.requestedByUserId,
        requestedByPhone: body.requestedByPhone || requester.requestedByPhone,
        requestedByEmail: body.requestedByEmail || requester.requestedByEmail,
        priority: body.priority || 'Normal',
        status: body.status || 'Draft',
        remarks: body.remarks || '',
        items,
        suppliers,
        financialYear: fy,
        companyId: req.companyId || null,
        createdBy: req.user._id,
    });

    await logAudit(req.user, 'CREATE', 'PurchaseRFQ', rfq._id, `RFQ ${rfqNumber} created`, {}, req);
    res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, rfq, 'RFQ created'));
});

export const updatePurchaseRfq = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.edit');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    if (['Converted to PO', 'Cancelled', 'Closed'].includes(rfq.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'RFQ cannot be edited in current status');
    }

    const body = req.body;
    if (body.items) rfq.items = await enrichRfqItems(body.items);
    if (body.supplierIds !== undefined) {
        rfq.suppliers = body.supplierIds.length ? await snapshotSuppliers(body.supplierIds) : [];
    }
    if (body.suppliers?.length) rfq.suppliers = body.suppliers;
    ['rfqDate', 'requiredByDate', 'department', 'requestedBy', 'requestedByPhone', 'requestedByEmail', 'priority', 'status', 'remarks'].forEach((k) => {
        if (body[k] !== undefined) rfq[k] = body[k];
    });
    rfq.updatedBy = req.user._id;
    await rfq.save();

    await logAudit(req.user, 'UPDATE', 'PurchaseRFQ', rfq._id, `RFQ ${rfq.rfqNumber} updated`, {}, req);
    res.json(new ApiResponse(200, rfq, 'RFQ updated'));
});

export const sendPurchaseRfq = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.edit');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    if (!rfq.items?.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'RFQ must have at least one item before sending');
    }
    rfq.status = 'Sent';
    rfq.updatedBy = req.user._id;
    await rfq.save();
    await logAudit(req.user, 'UPDATE', 'PurchaseRFQ', rfq._id, `RFQ ${rfq.rfqNumber} sent`, {}, req);
    res.json(new ApiResponse(200, rfq, 'RFQ marked as sent'));
});

export const cancelPurchaseRfq = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.cancel');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    if (rfq.status === 'Converted to PO') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Converted RFQ cannot be cancelled');
    }
    rfq.status = 'Cancelled';
    rfq.updatedBy = req.user._id;
    await rfq.save();
    await logAudit(req.user, 'CANCEL', 'PurchaseRFQ', rfq._id, `RFQ ${rfq.rfqNumber} cancelled`, { reason: req.body?.reason }, req);
    res.json(new ApiResponse(200, rfq, 'RFQ cancelled'));
});

export const getRfqComparison = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.quotation_comparison.view');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    const quotations = await SupplierQuotation.find({
        rfqId: rfq._id,
        isDeleted: { $ne: true },
        status: { $nin: ['Rejected', 'Pending'] },
    });
    const data = buildComparisonMatrix(rfq, quotations);
    res.json(new ApiResponse(200, data, 'Comparison loaded'));
});

export const saveRfqSelection = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.quotation_comparison.view');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    const { wholeSupplierId, lineSelections, recommendedSupplierId, recommendationReason } = req.body;
    rfq.wholeSupplierId = wholeSupplierId || null;
    rfq.lineSelections = lineSelections || [];
    rfq.recommendedSupplierId = recommendedSupplierId || null;
    rfq.recommendationReason = recommendationReason || '';
    if (rfq.status === 'Sent' || rfq.status === 'Quotation Received') rfq.status = 'Compared';
    rfq.updatedBy = req.user._id;
    await rfq.save();

    if (wholeSupplierId) {
        await SupplierQuotation.updateMany(
            { rfqId: rfq._id, supplierId: { $ne: wholeSupplierId }, isDeleted: { $ne: true } },
            { $set: { status: 'Not Selected' } }
        );
        await SupplierQuotation.updateMany(
            { rfqId: rfq._id, supplierId: wholeSupplierId, isDeleted: { $ne: true } },
            { $set: { status: 'Selected' } }
        );
    }

    res.json(new ApiResponse(200, rfq, 'Selection saved'));
});

export const approvePurchaseRfq = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.quotation_approve');
    const rfq = await PurchaseRfq.findById(req.params.id);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    rfq.approvedBy = req.user._id;
    rfq.approvedAt = new Date();
    rfq.approvalRemarks = req.body?.approvalRemarks || '';
    rfq.updatedBy = req.user._id;
    await rfq.save();
    await logAudit(req.user, 'APPROVE', 'PurchaseRFQ', rfq._id, `RFQ ${rfq.rfqNumber} approved`, {}, req);
    res.json(new ApiResponse(200, rfq, 'RFQ approved'));
});

export const convertRfqToPo = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.convert_rfq_to_po');
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const pos = await convertRfqToPurchaseOrders(req.params.id, req.user._id, session);
        await logAudit(
            req.user,
            'CREATE',
            'PurchaseRFQ',
            req.params.id,
            `RFQ converted to ${pos.length} PO(s)`,
            { poNumbers: pos.map((p) => p.poNumber) },
            req
        );
        await session.commitTransaction();
        res.json(new ApiResponse(200, { purchaseOrders: pos }, 'Converted to Purchase Order(s)'));
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

// ── Supplier quotations ─────────────────────────────────────────────────────

export const listSupplierQuotations = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.supplier_quotation.view');
    const { rfqId, supplierId, status, search, page = 1, limit = 50 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (rfqId) filter.rfqId = rfqId;
    if (supplierId) filter.supplierId = supplierId;
    if (status) filter.status = status;
    if (search) {
        filter.$or = [
            { quotationNo: { $regex: search, $options: 'i' } },
            { rfqNumber: { $regex: search, $options: 'i' } },
            { supplierName: { $regex: search, $options: 'i' } },
        ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [quotations, total] = await Promise.all([
        SupplierQuotation.find(filter).sort({ quotationDate: -1 }).skip(skip).limit(Number(limit)),
        SupplierQuotation.countDocuments(filter),
    ]);
    res.json(new ApiResponse(200, { quotations, total }, 'Quotations fetched'));
});

export const getSupplierQuotationById = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.supplier_quotation.view');
    const q = await SupplierQuotation.findById(req.params.id);
    if (!q || q.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'Quotation not found');
    res.json(new ApiResponse(200, q, 'Quotation fetched'));
});

export const upsertSupplierQuotation = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.supplier_quotation.add');
    const body = req.body;
    const rfq = await PurchaseRfq.findById(body.rfqId);
    if (!rfq || rfq.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'RFQ not found');
    if (['Cancelled', 'Closed', 'Converted to PO'].includes(rfq.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'RFQ is not open for quotations');
    }

    const supplier = await Supplier.findById(body.supplierId);
    if (!supplier) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');

    const items = calcQuotationItems(
        (body.items || []).map((it) => {
            const rfqLine = rfq.items.id?.(it.rfqItemId) || rfq.items.find((r) => String(r._id) === String(it.rfqItemId));
            return {
                ...it,
                itemId: it.itemId || rfqLine?.itemId,
                itemCode: it.itemCode || rfqLine?.itemCode,
                requiredQty: it.requiredQty ?? rfqLine?.requiredQty,
            };
        })
    );

    let quotation = await SupplierQuotation.findOne({
        rfqId: rfq._id,
        supplierId: supplier._id,
        isDeleted: { $ne: true },
    });

    const payload = {
        rfqId: rfq._id,
        rfqNumber: rfq.rfqNumber,
        supplierId: supplier._id,
        supplierName: supplier.supplierName,
        quotationNo: body.quotationNo || '',
        quotationDate: body.quotationDate || new Date(),
        validTill: body.validTill || null,
        paymentTerms: body.paymentTerms || supplier.paymentTerms || '',
        deliveryTime: body.deliveryTime || '',
        freightPackingForwarding: body.freightPackingForwarding || 0,
        gstExtraInclusive: body.gstExtraInclusive || 'Extra',
        warranty: body.warranty || '',
        remarks: body.remarks || '',
        attachmentName: body.attachmentName || '',
        attachmentPath: body.attachmentPath || '',
        items,
        status: body.status || 'Received',
        financialYear: rfq.financialYear,
        companyId: req.companyId || null,
        updatedBy: req.user._id,
    };

    if (quotation) {
        if (quotation.convertedPoId) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Already converted to PO ${quotation.convertedPoNumber}`);
        }
        Object.assign(quotation, payload);
        if (quotation.status === 'Pending') quotation.status = 'Received';
        await quotation.save();
    } else {
        quotation = await SupplierQuotation.create({
            ...payload,
            createdBy: req.user._id,
        });
    }

    if (rfq.status === 'Sent' || rfq.status === 'Draft') rfq.status = 'Quotation Received';
    rfq.updatedBy = req.user._id;
    await rfq.save();

    await logAudit(req.user, 'CREATE', 'SupplierQuotation', quotation._id, `Quotation for RFQ ${rfq.rfqNumber}`, {}, req);
    res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, quotation, 'Quotation saved'));
});

export const getRfqReports = asyncHandler(async (req, res) => {
    assertPerm(req.user, 'purchase.purchase_rfq.view');
    const { report } = req.query;
    const base = { isDeleted: { $ne: true } };
    if (req.companyId) base.companyId = req.companyId;

    if (report === 'rfq-pending') {
        const rfqs = await PurchaseRfq.find({ ...base, status: { $in: ['Draft', 'Sent'] } }).sort({ rfqDate: -1 }).limit(200);
        return res.json(new ApiResponse(200, { rfqs }, 'RFQ pending report'));
    }
    if (report === 'quotation-pending') {
        const sentRfqs = await PurchaseRfq.find({ ...base, status: { $in: ['Sent', 'Quotation Received'] } }).select('_id rfqNumber suppliers');
        const quotCounts = await SupplierQuotation.aggregate([
            { $match: { isDeleted: { $ne: true }, status: { $ne: 'Pending' } } },
            { $group: { _id: '$rfqId', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(quotCounts.map((c) => [String(c._id), c.count]));
        const pending = sentRfqs.filter((r) => (countMap.get(String(r._id)) || 0) < (r.suppliers?.length || 0));
        return res.json(new ApiResponse(200, { rfqs: pending }, 'Quotation pending report'));
    }
    if (report === 'converted-po') {
        const rfqs = await PurchaseRfq.find({ ...base, status: 'Converted to PO' }).sort({ updatedAt: -1 }).limit(200);
        return res.json(new ApiResponse(200, { rfqs }, 'Converted to PO report'));
    }

    const [rfqPending, quotPending, converted] = await Promise.all([
        PurchaseRfq.countDocuments({ ...base, status: { $in: ['Draft', 'Sent'] } }),
        PurchaseRfq.countDocuments({ ...base, status: 'Quotation Received' }),
        PurchaseRfq.countDocuments({ ...base, status: 'Converted to PO' }),
    ]);
    res.json(new ApiResponse(200, { rfqPending, quotPending, converted }, 'RFQ summary'));
});
