import { VoucherAttachment } from '../models/voucherAttachment.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { ApiError } from '../utils/ApiError.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function buildSort(sortBy) {
    if (!sortBy) return { updatedAt: -1 };
    const parts = String(sortBy).split(',');
    const out = {};
    for (const p of parts) {
        const [k, o] = p.split(':');
        if (k) out[k] = o === 'asc' ? 1 : -1;
    }
    return out;
}

async function resolvePurchaseInvoiceMeta(voucherId) {
    const inv = await PurchaseInvoice.findById(voucherId).select(
        'invoiceNumber supplierName supplierInvoiceNo grandTotal invoiceDate status isDeleted',
    );
    if (!inv || inv.isDeleted) throw new ApiError(404, 'Purchase invoice not found');
    return {
        voucherNumber: inv.invoiceNumber || '',
        partyName: inv.supplierName || '',
        billNo: inv.supplierInvoiceNo || '',
        amount: r2(inv.grandTotal),
        voucherDate: inv.invoiceDate || null,
    };
}

export async function listByVoucher(voucherType, voucherId) {
    return VoucherAttachment.find({
        voucherType,
        voucherId,
        isDeleted: false,
    }).sort({ createdAt: -1 });
}

export async function uploadAttachment(body, file, userId) {
    if (!file) throw new ApiError(400, 'No file uploaded');

    const voucherType = body.voucherType;
    const voucherId = body.voucherId;
    if (!voucherType || !voucherId) {
        throw new ApiError(400, 'voucherType and voucherId are required');
    }

    let meta = {
        voucherNumber: body.voucherNumber || '',
        partyName: body.partyName || '',
        billNo: body.billNo || '',
        amount: Number(body.amount) || 0,
        voucherDate: body.voucherDate ? new Date(body.voucherDate) : null,
    };

    if (voucherType === 'purchase_invoice') {
        meta = await resolvePurchaseInvoiceMeta(voucherId);
    }

    const publicUrl = '/uploads/voucher-attachments/' + file.filename;
    const doc = await VoucherAttachment.create({
        voucherType,
        voucherId,
        ...meta,
        fileName: file.filename,
        originalName: file.originalname || file.filename,
        mimeType: file.mimetype || '',
        fileUrl: publicUrl,
        fileSize: file.size || 0,
        source: body.source || 'upload',
        label: body.label || '',
        uploadedBy: userId,
    });

    return doc;
}

export async function deleteAttachment(id, userId) {
    const doc = await VoucherAttachment.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Attachment not found');
    doc.isDeleted = true;
    doc.updatedAt = new Date();
    await doc.save();
    return doc;
}

export async function searchVouchers(filter, options) {
    const searchBy = filter.searchBy || 'lastSaved';
    const search = String(filter.search || '').trim();
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 25;

    const piQuery = { isDeleted: { $ne: true }, status: { $ne: 'Cancelled' } };

    if (search) {
        if (searchBy === 'billNo') {
            piQuery.supplierInvoiceNo = new RegExp(search, 'i');
        } else if (searchBy === 'voucherNo') {
            piQuery.invoiceNumber = new RegExp(search, 'i');
        } else if (searchBy === 'partyName') {
            piQuery.supplierName = new RegExp(search, 'i');
        } else {
            piQuery.$or = [
                { supplierInvoiceNo: new RegExp(search, 'i') },
                { invoiceNumber: new RegExp(search, 'i') },
                { supplierName: new RegExp(search, 'i') },
            ];
        }
    }

    const invoices = await PurchaseInvoice.find(piQuery)
        .select('_id invoiceNumber supplierName supplierInvoiceNo grandTotal invoiceDate updatedAt')
        .sort(searchBy === 'lastSaved' ? { updatedAt: -1 } : { invoiceDate: -1 })
        .limit(limit);

    const ids = invoices.map((i) => i._id);
    const attachmentCounts = await VoucherAttachment.aggregate([
        {
            $match: {
                voucherType: 'purchase_invoice',
                voucherId: { $in: ids },
                isDeleted: false,
            },
        },
        { $group: { _id: '$voucherId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(attachmentCounts.map((r) => [String(r._id), r.count]));

    const results = invoices.map((inv) => {
        const count = countMap.get(String(inv._id)) || 0;
        return {
            voucherType: 'purchase_invoice',
            voucherId: inv._id,
            voucherNumber: inv.invoiceNumber,
            partyName: inv.supplierName,
            billNo: inv.supplierInvoiceNo || '',
            amount: r2(inv.grandTotal),
            voucherDate: inv.invoiceDate,
            updatedAt: inv.updatedAt,
            attachmentCount: count,
            attachmentMissing: count === 0,
            statusLabel: count === 0 ? 'Attachment Missing' : 'Attached',
        };
    });

    return { results, totalResults: results.length };
}

export async function queryMissingAttachments(filter, options) {
    const category = filter.category || 'purchase';
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 100;

    if (category !== 'purchase') {
        return { results: [], totalResults: 0, message: 'Only purchase bills are supported in this release.' };
    }

    const invoices = await PurchaseInvoice.find({
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    })
        .select('_id invoiceNumber supplierName supplierInvoiceNo grandTotal invoiceDate updatedAt')
        .sort({ updatedAt: -1 })
        .limit(Math.min(limit * 3, 300));

    const ids = invoices.map((i) => i._id);
    const withAttachments = await VoucherAttachment.distinct('voucherId', {
        voucherType: 'purchase_invoice',
        voucherId: { $in: ids },
        isDeleted: false,
    });
    const attachedSet = new Set(withAttachments.map(String));

    const missing = invoices
        .filter((inv) => !attachedSet.has(String(inv._id)))
        .slice(0, limit)
        .map((inv) => ({
            voucherType: 'purchase_invoice',
            voucherId: inv._id,
            voucherNumber: inv.invoiceNumber,
            voucherDate: inv.invoiceDate,
            partyName: inv.supplierName,
            amount: r2(inv.grandTotal),
            status: 'Missing',
        }));

    return { results: missing, totalResults: missing.length };
}

export async function getSummaryStats() {
    const [totalPi, attachedIds] = await Promise.all([
        PurchaseInvoice.countDocuments({ isDeleted: { $ne: true }, status: { $ne: 'Cancelled' } }),
        VoucherAttachment.distinct('voucherId', {
            voucherType: 'purchase_invoice',
            isDeleted: false,
        }),
    ]);
    const missingPurchase = Math.max(0, totalPi - attachedIds.length);
    return {
        missingPurchaseBills: missingPurchase,
        missingExpenseBills: 0,
        missingSalesDispatchProof: 0,
    };
}

export async function queryAttachments(filter, options) {
    const q = { isDeleted: false };
    if (filter.voucherType) q.voucherType = filter.voucherType;
    if (filter.voucherId) q.voucherId = filter.voucherId;

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 50;
    const skip = (page - 1) * limit;

    const [results, totalResults] = await Promise.all([
        VoucherAttachment.find(q).sort(buildSort(options.sortBy)).skip(skip).limit(limit),
        VoucherAttachment.countDocuments(q),
    ]);

    return { results, page, limit, totalResults, totalPages: Math.ceil(totalResults / limit) };
}
