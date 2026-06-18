import pick from '../utils/pick.js';
import mongoose from 'mongoose';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ScanEntryDraft } from '../models/scanEntryDraft.model.js';
import { ScanEntryKeywordMap } from '../models/scanEntryKeywordMap.model.js';
import { createDraftFromUpload, createDraftsFromBulkUpload } from '../services/scanEntry/upload.service.js';
import { validateDraft } from '../services/scanEntry/validation.service.js';
import { checkDuplicate, overrideDuplicate } from '../services/scanEntry/duplicateCheck.service.js';
import { saveDraftOnly, postDraft, rejectDraft, softDeleteDraft, listItemsForMapping, repostPurchaseInvoiceLedger } from '../services/scanEntry/posting.service.js';
import { setSupplierMapping, updateItemMappings, autoMapDraft } from '../services/scanEntry/mapping.service.js';
import { proposeDraftSupplier, approvePendingMaster } from '../services/scanEntry/pendingMaster.service.js';
import { normalizePostingMode } from '../services/scanEntry/postingMode.util.js';

const populateDraftQuery = (query) => query
    .populate('uploadedBy', 'name email')
    .populate('reviewedBy', 'name email')
    .populate('postedBy', 'name email')
    .populate('assignedTo', 'name email')
    .populate({
        path: 'mappedSupplierId',
        select: 'supplierName gstNumber ledgerId supplierCode',
        populate: { path: 'ledgerId', select: 'name gstin' },
    })
    .populate('mappedCustomerId', 'customerName gstNumber')
    .populate('mappedLedgerId', 'name gstin ledgerName');

const fetchPopulatedDraft = async (id) => {
    const draft = await populateDraftQuery(
        ScanEntryDraft.findOne({ _id: id, deletedAt: null }),
    ).lean();
    if (!draft) throw new ApiError(404, 'Draft not found');
    return draft;
};

const ALLOWED_MODULES = ['purchase_invoice', 'sales_invoice', 'expense_bill'];

export const uploadSingle = asyncHandler(async (req, res) => {
    const moduleType = String(req.body.moduleType || '');
    if (!ALLOWED_MODULES.includes(moduleType)) throw new ApiError(400, 'Invalid moduleType');
    if (!req.file) throw new ApiError(400, 'File is required');
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    const draft = await createDraftFromUpload({
        file: req.file,
        moduleType,
        financialYear,
        userId: req.user.id,
        companyId: req.companyId,
        postingMode: moduleType === 'purchase_invoice' ? normalizePostingMode(req.body.postingMode) : undefined,
    });
    res.send(new ApiResponse(201, draft, 'Scan Entry draft uploaded'));
});

export const bulkUpload = asyncHandler(async (req, res) => {
    const moduleType = String(req.body.moduleType || '');
    if (!ALLOWED_MODULES.includes(moduleType)) throw new ApiError(400, 'Invalid moduleType');
    const files = req.files || [];
    if (!files.length) throw new ApiError(400, 'At least one file is required');
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    const drafts = await createDraftsFromBulkUpload({
        files,
        moduleType,
        financialYear,
        userId: req.user.id,
        companyId: req.companyId,
        postingMode: moduleType === 'purchase_invoice' ? normalizePostingMode(req.body.postingMode) : undefined,
    });
    res.send(new ApiResponse(201, { results: drafts, count: drafts.length }, 'Bulk drafts uploaded'));
});

export const listDrafts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, moduleType, status, uploader, assignedTo, search, fromDate, toDate } = req.query;
    const query = { deletedAt: null };
    if (moduleType) query.moduleType = moduleType;
    if (status) query.status = status;
    if (uploader) query.uploadedBy = uploader;
    if (assignedTo) query.assignedTo = assignedTo;
    if (search) {
        query.$or = [
            { originalFileName: new RegExp(search, 'i') },
            { 'extractedData.supplierInvoiceNo': new RegExp(search, 'i') },
            { 'extractedData.billNo': new RegExp(search, 'i') },
            { 'extractedData.supplierName': new RegExp(search, 'i') },
            { 'extractedData.customerName': new RegExp(search, 'i') },
            { 'extractedData.vendorName': new RegExp(search, 'i') },
        ];
    }
    if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [results, total] = await Promise.all([
        ScanEntryDraft.find(query)
            .sort({ updatedAt: -1 })
            .skip((p - 1) * l)
            .limit(l)
            .populate('uploadedBy', 'name email')
            .populate('assignedTo', 'name email')
            .populate({
                path: 'mappedSupplierId',
                select: 'supplierName gstNumber ledgerId',
                populate: { path: 'ledgerId', select: 'name gstin' },
            })
            .populate('mappedCustomerId', 'customerName gstNumber')
            .populate('mappedLedgerId', 'name gstin')
            .lean(),
        ScanEntryDraft.countDocuments(query),
    ]);
    res.send(new ApiResponse(200, { results, page: p, limit: l, total }));
});

export const getDraftById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, 'Invalid draft id');
    }

    const exists = await ScanEntryDraft.findOne({ _id: id, deletedAt: null })
        .select('moduleType mappedSupplierId status')
        .lean();
    if (!exists) {
        const deleted = await ScanEntryDraft.findOne({ _id: id, deletedAt: { $ne: null } })
            .select('status deletedAt finalLinkedInvoiceId finalLinkedVoucherId')
            .lean();
        if (deleted) {
            throw new ApiError(410, 'This draft was deleted. Upload the file again from Bulk Scan Import.');
        }
        throw new ApiError(404, 'Draft not found');
    }

    if (
        exists.moduleType === 'purchase_invoice'
        && !exists.mappedSupplierId
        && !['ocr_processing', 'uploaded', 'posted', 'rejected'].includes(exists.status)
    ) {
        try {
            await autoMapDraft(id);
        } catch {
            // mapping must not block opening the draft for review
        }
    }

    const draft = await fetchPopulatedDraft(id);
    res.send(new ApiResponse(200, draft));
});

export const rematchMaster = asyncHandler(async (req, res) => {
    const draft = await ScanEntryDraft.findOne({ _id: req.params.id, deletedAt: null });
    if (!draft) throw new ApiError(404, 'Draft not found');
    if (req.body?.extractedData) {
        draft.extractedData = { ...draft.extractedData, ...req.body.extractedData };
        await draft.save();
    }
    await autoMapDraft(req.params.id);
    await validateDraft(req.params.id);
    await checkDuplicate(req.params.id);
    const populated = await fetchPopulatedDraft(req.params.id);
    res.send(new ApiResponse(200, populated, 'Master matching completed'));
});

export const updateDraft = asyncHandler(async (req, res) => {
    const patch = pick(req.body, ['extractedData', 'userRemarks', 'assignedTo', 'mappedSupplierId', 'mappedCustomerId', 'mappedLedgerId', 'mappedItems']);
    await saveDraftOnly(req.params.id, patch, req.user.id);
    const draft = await fetchPopulatedDraft(req.params.id);
    res.send(new ApiResponse(200, draft, 'Draft updated'));
});

export const matchSupplier = asyncHandler(async (req, res) => {
    const { supplierId } = req.body;
    if (!supplierId) throw new ApiError(400, 'supplierId is required');
    await setSupplierMapping(req.params.id, supplierId, req.user.id);
    const draft = await fetchPopulatedDraft(req.params.id);
    res.send(new ApiResponse(200, draft, 'Supplier mapped'));
});

export const matchItems = asyncHandler(async (req, res) => {
    const mappedItems = Array.isArray(req.body.mappedItems) ? req.body.mappedItems : null;
    if (!mappedItems) throw new ApiError(400, 'mappedItems array is required');
    await updateItemMappings(req.params.id, mappedItems, req.user.id, !!req.body.saveAlias);
    const draft = await fetchPopulatedDraft(req.params.id);
    res.send(new ApiResponse(200, draft, 'Items mapped'));
});

export const validateDraftNow = asyncHandler(async (req, res) => {
    await validateDraft(req.params.id);
    await checkDuplicate(req.params.id);
    const draft = await fetchPopulatedDraft(req.params.id);
    res.send(new ApiResponse(200, draft, 'Validation completed'));
});

export const saveAsDraft = asyncHandler(async (req, res) => {
    const patch = pick(req.body, ['extractedData', 'userRemarks', 'assignedTo', 'mappedSupplierId', 'mappedCustomerId', 'mappedLedgerId', 'mappedItems']);
    await saveDraftOnly(req.params.id, patch, req.user.id);
    const draft = await fetchPopulatedDraft(req.params.id);
    res.send(new ApiResponse(200, draft, 'Draft saved'));
});

export const postDraftNow = asyncHandler(async (req, res) => {
    const result = await postDraft(req.params.id, req.user);
    res.send(new ApiResponse(200, result, 'Draft posted successfully'));
});

export const repostLedgerNow = asyncHandler(async (req, res) => {
    const draft = await ScanEntryDraft.findOne({ _id: req.params.id, deletedAt: null });
    if (!draft) throw new ApiError(404, 'Draft not found');
    if (!draft.finalLinkedInvoiceId) throw new ApiError(400, 'No purchase invoice linked to this draft');
    const result = await repostPurchaseInvoiceLedger(draft.finalLinkedInvoiceId, req.user.id);
    res.send(new ApiResponse(200, result, 'Ledger posted successfully'));
});

export const repostLinkedPurchaseLedger = asyncHandler(async (req, res) => {
    const result = await repostPurchaseInvoiceLedger(req.params.invoiceId, req.user.id);
    res.send(new ApiResponse(200, result, 'Ledger posted successfully'));
});

export const rejectDraftNow = asyncHandler(async (req, res) => {
    const draft = await rejectDraft(req.params.id, req.body?.remark, req.user.id);
    res.send(new ApiResponse(200, draft, 'Draft rejected'));
});

export const createDraftSupplierNow = asyncHandler(async (req, res) => {
    const draft = await proposeDraftSupplier(req.params.id, req.user.id);
    const populated = await populateDraftQuery(ScanEntryDraft.findById(draft._id)).lean();
    res.send(new ApiResponse(200, populated, 'Draft supplier proposed'));
});

export const approvePendingMasterNow = asyncHandler(async (req, res) => {
    const masterIndex = Number(req.body?.masterIndex ?? 0);
    const draft = await approvePendingMaster(req.params.id, masterIndex, req.user.id);
    await autoMapDraft(req.params.id);
    const populated = await populateDraftQuery(ScanEntryDraft.findById(draft._id)).lean();
    res.send(new ApiResponse(200, populated, 'Pending master approved'));
});

export const overrideDuplicateNow = asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw new ApiError(400, 'reason is required');
    const draft = await overrideDuplicate(req.params.id, reason);
    res.send(new ApiResponse(200, draft, 'Duplicate overridden'));
});

export const deleteDraftNow = asyncHandler(async (req, res) => {
    const draft = await softDeleteDraft(req.params.id, req.user.id);
    res.send(new ApiResponse(200, draft, 'Draft deleted'));
});

export const listItems = asyncHandler(async (req, res) => {
    const results = await listItemsForMapping(String(req.query.search || '').trim());
    res.send(new ApiResponse(200, { results }));
});

export const listKeywordMaps = asyncHandler(async (req, res) => {
    const rows = await ScanEntryKeywordMap.find({}).sort({ keyword: 1 }).lean();
    res.send(new ApiResponse(200, { results: rows }));
});

export const createKeywordMap = asyncHandler(async (req, res) => {
    const keyword = String(req.body?.keyword || '').trim().toLowerCase();
    const ledgerId = req.body?.ledgerId;
    if (!keyword || !ledgerId) throw new ApiError(400, 'keyword and ledgerId are required');
    const row = await ScanEntryKeywordMap.findOneAndUpdate(
        { keyword },
        { keyword, ledgerId, ledgerName: req.body?.ledgerName || '', updatedBy: req.user.id, createdBy: req.user.id },
        { new: true, upsert: true },
    );
    res.send(new ApiResponse(200, row, 'Keyword map saved'));
});

export const deleteKeywordMap = asyncHandler(async (req, res) => {
    const row = await ScanEntryKeywordMap.findByIdAndDelete(req.params.id);
    if (!row) throw new ApiError(404, 'Keyword map not found');
    res.send(new ApiResponse(200, row, 'Keyword map deleted'));
});

export const getReports = asyncHandler(async (req, res) => {
    const base = { deletedAt: null };
    const [pending, posted, duplicate, errors, total] = await Promise.all([
        ScanEntryDraft.countDocuments({ ...base, status: { $in: ['uploaded', 'ocr_processing', 'ocr_completed', 'needs_review', 'ready_to_post'] } }),
        ScanEntryDraft.countDocuments({ ...base, status: 'posted' }),
        ScanEntryDraft.countDocuments({ ...base, status: 'duplicate_found' }),
        ScanEntryDraft.countDocuments({ ...base, status: 'error' }),
        ScanEntryDraft.countDocuments(base),
    ]);
    const userWise = await ScanEntryDraft.aggregate([
        { $match: base },
        { $group: { _id: '$uploadedBy', total: { $sum: 1 }, posted: { $sum: { $cond: [{ $eq: ['$status', 'posted'] }, 1, 0] } }, errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } } } },
        { $sort: { total: -1 } },
    ]);
    res.send(new ApiResponse(200, { summary: { total, pending, posted, duplicate, errors }, userWise }));
});

