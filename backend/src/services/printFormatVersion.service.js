import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { PrintFormatVersion } from '../models/printFormatVersion.model.js';
import { Company } from '../models/company.model.js';
import {
    PRINT_FORMAT_VERSION_DOCUMENT_TYPES,
    PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS,
    PRINT_FORMAT_VERSION_LIVE_WIRED,
    PRINT_FORMAT_VERSION_STATUSES,
    PRINT_FORMAT_VERSION_STATUS_LABELS,
    defaultLayoutSnapshot,
    isEditableStatus,
    nextFormatVersionLabel,
} from '../constants/printFormatVersion.constants.js';

const POPULATE = [
    { path: 'companyId', select: 'companyName companyCode isActive' },
    { path: 'approvedBy', select: 'name email' },
    { path: 'lockedBy', select: 'name email' },
    { path: 'createdBy', select: 'name email' },
    { path: 'lastChangedBy', select: 'name email' },
    { path: 'copiedFromId', select: 'name formatVersion status' },
];

function assertStatus(value) {
    const status = String(value || '').toUpperCase();
    if (!PRINT_FORMAT_VERSION_STATUSES.includes(status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status: ${value}`);
    }
    return status;
}

async function assertCompany(companyId) {
    const company = await Company.findById(companyId).select('_id companyName').lean();
    if (!company) throw new ApiError(httpStatus.BAD_REQUEST, 'Company not found');
    return company;
}

function cloneLayout(layout, documentType) {
    if (layout && typeof layout === 'object') {
        return JSON.parse(JSON.stringify(layout));
    }
    return defaultLayoutSnapshot(documentType);
}

export async function listPrintFormatVersions({ companyId, documentType, status } = {}) {
    const filter = {};
    if (companyId) filter.companyId = companyId;
    if (documentType) filter.documentType = String(documentType).toUpperCase();
    if (status) filter.status = String(status).toUpperCase();

    return PrintFormatVersion.find(filter)
        .populate(POPULATE)
        .sort({ updatedAt: -1 })
        .lean();
}

export async function getPrintFormatVersionById(id) {
    const doc = await PrintFormatVersion.findById(id).populate(POPULATE).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Print format version not found');
    return doc;
}

export async function createDraftPrintFormatVersion(payload, userId) {
    const companyId = payload.companyId;
    await assertCompany(companyId);

    const documentType = String(payload.documentType || '').toUpperCase();
    if (!PRINT_FORMAT_VERSION_DOCUMENT_TYPES.includes(documentType)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid document type');
    }

    let formatVersion = String(payload.formatVersion || '').trim();
    if (!formatVersion) {
        const existing = await PrintFormatVersion.find({ companyId, documentType })
            .select('formatVersion')
            .lean();
        formatVersion = nextFormatVersionLabel(existing.map((e) => e.formatVersion));
    }

    const clash = await PrintFormatVersion.findOne({ companyId, documentType, formatVersion })
        .select('_id')
        .lean();
    if (clash) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'A format version already exists for this company + document type + version',
        );
    }

    const label = PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS[documentType] || documentType;
    const name =
        String(payload.name || '').trim() || `${label} ${formatVersion}`;

    const doc = await PrintFormatVersion.create({
        companyId,
        documentType,
        formatVersion,
        name,
        status: 'DRAFT',
        isDefault: false,
        paperSize: payload.paperSize || 'A4',
        orientation: payload.orientation || 'portrait',
        margins: payload.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' },
        layoutSnapshot: cloneLayout(payload.layoutSnapshot, documentType),
        notes: payload.notes || '',
        formPrintLockId: payload.formPrintLockId || null,
        goldenReferenceId: payload.goldenReferenceId || null,
        livePrintEnabled: false,
        createdBy: userId,
        lastChangedBy: userId,
    });

    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

/**
 * Create a DRAFT copy from an existing version (including LOCKED/DEFAULT).
 * Does not alter the source row.
 */
export async function copyPrintFormatVersion(sourceId, payload = {}, userId) {
    const source = await PrintFormatVersion.findById(sourceId);
    if (!source) throw new ApiError(httpStatus.NOT_FOUND, 'Source format version not found');

    const companyId = payload.companyId || source.companyId;
    await assertCompany(companyId);

    const documentType = String(payload.documentType || source.documentType).toUpperCase();
    const existing = await PrintFormatVersion.find({ companyId, documentType })
        .select('formatVersion')
        .lean();
    const formatVersion =
        String(payload.formatVersion || '').trim() ||
        nextFormatVersionLabel(existing.map((e) => e.formatVersion));

    const clash = await PrintFormatVersion.findOne({ companyId, documentType, formatVersion })
        .select('_id')
        .lean();
    if (clash) {
        throw new ApiError(httpStatus.CONFLICT, 'Target format version already exists');
    }

    const doc = await PrintFormatVersion.create({
        companyId,
        documentType,
        formatVersion,
        name: String(payload.name || '').trim() || `${source.name} (copy ${formatVersion})`,
        status: 'DRAFT',
        isDefault: false,
        paperSize: source.paperSize,
        orientation: source.orientation,
        margins: source.margins ? source.margins.toObject?.() || source.margins : undefined,
        layoutSnapshot: cloneLayout(source.layoutSnapshot, documentType),
        copiedFromId: source._id,
        notes: payload.notes != null ? payload.notes : `Copied from ${source.formatVersion}`,
        formPrintLockId: source.formPrintLockId,
        goldenReferenceId: source.goldenReferenceId,
        livePrintEnabled: false,
        createdBy: userId,
        lastChangedBy: userId,
    });

    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

export async function updatePrintFormatVersion(id, payload, userId) {
    const doc = await PrintFormatVersion.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Print format version not found');

    if (!isEditableStatus(doc.status)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Cannot edit status ${doc.status} directly. Create a copy/new draft version instead.`,
        );
    }

    if (payload.name !== undefined) {
        const name = String(payload.name || '').trim();
        if (!name) throw new ApiError(httpStatus.BAD_REQUEST, 'Name is required');
        doc.name = name;
    }
    if (payload.notes !== undefined) doc.notes = String(payload.notes || '');
    if (payload.paperSize !== undefined) doc.paperSize = payload.paperSize;
    if (payload.orientation !== undefined) doc.orientation = payload.orientation;
    if (payload.margins !== undefined) doc.margins = payload.margins;
    if (payload.layoutSnapshot !== undefined) {
        doc.layoutSnapshot = cloneLayout(payload.layoutSnapshot, doc.documentType);
    }
    if (payload.formPrintLockId !== undefined) doc.formPrintLockId = payload.formPrintLockId || null;
    if (payload.goldenReferenceId !== undefined) {
        doc.goldenReferenceId = payload.goldenReferenceId || null;
    }

    // Never allow enabling live print from this Phase 5 API
    doc.livePrintEnabled = false;
    doc.lastChangedBy = userId;
    await doc.save();
    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

export async function approvePrintFormatVersion(id, userId) {
    const doc = await PrintFormatVersion.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Print format version not found');
    if (doc.status !== 'DRAFT') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Only DRAFT versions can be approved');
    }
    doc.status = 'APPROVED';
    doc.approvedBy = userId;
    doc.approvedDate = new Date();
    doc.lastChangedBy = userId;
    doc.livePrintEnabled = false;
    await doc.save();
    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

/**
 * Set as DEFAULT for company + documentType.
 * Previous DEFAULT (unlocked) → APPROVED; previous LOCKED default stays LOCKED but isDefault cleared
 * only if we demote — actually LOCKED defaults: user said locked default cannot be edited;
 * setting a new default should demote old DEFAULT to APPROVED, and if old was LOCKED, keep LOCKED
 * but clear isDefault so only one default exists.
 */
export async function setDefaultPrintFormatVersion(id, userId) {
    const doc = await PrintFormatVersion.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Print format version not found');
    if (!['APPROVED', 'DEFAULT'].includes(doc.status)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Only APPROVED versions can be set as default (approve draft first)',
        );
    }

    const previous = await PrintFormatVersion.find({
        companyId: doc.companyId,
        documentType: doc.documentType,
        isDefault: true,
        _id: { $ne: doc._id },
    });

    for (const prev of previous) {
        prev.isDefault = false;
        if (prev.status === 'DEFAULT') prev.status = 'APPROVED';
        // LOCKED stays LOCKED but is no longer the active default pointer
        prev.lastChangedBy = userId;
        await prev.save();
    }

    doc.status = 'DEFAULT';
    doc.isDefault = true;
    doc.lastChangedBy = userId;
    doc.livePrintEnabled = false;
    await doc.save();
    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

export async function lockPrintFormatVersion(id, userId) {
    const doc = await PrintFormatVersion.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Print format version not found');
    if (!['DEFAULT', 'APPROVED'].includes(doc.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Only DEFAULT or APPROVED versions can be locked');
    }
    doc.status = 'LOCKED';
    doc.lockedBy = userId;
    doc.lockedDate = new Date();
    // Keep isDefault if it was the default
    doc.lastChangedBy = userId;
    doc.livePrintEnabled = false;
    await doc.save();
    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

export async function archivePrintFormatVersion(id, userId) {
    const doc = await PrintFormatVersion.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Print format version not found');
    if (doc.status === 'LOCKED' && doc.isDefault) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot archive the locked default. Set another default first, or create a new version.',
        );
    }
    if (doc.status === 'DEFAULT') {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot archive the current DEFAULT. Set another default first.',
        );
    }
    doc.status = 'ARCHIVED';
    doc.isDefault = false;
    doc.lastChangedBy = userId;
    doc.livePrintEnabled = false;
    await doc.save();
    return PrintFormatVersion.findById(doc._id).populate(POPULATE);
}

/**
 * Preview helper: return format metadata + optional real document summary.
 * Does NOT generate live PDF and does NOT change print templates.
 */
export async function previewPrintFormatVersion(id, { documentId, documentNumber } = {}) {
    const format = await getPrintFormatVersionById(id);
    let documentPreview = null;

    if (documentId || documentNumber) {
        documentPreview = await loadDocumentPreview(format, { documentId, documentNumber });
    }

    return {
        livePrintWired: PRINT_FORMAT_VERSION_LIVE_WIRED,
        livePrintEnabled: false,
        message:
            'Preview is read-only metadata. Live Sales Order / Sales Invoice print output is not changed by this manager.',
        format,
        documentPreview,
    };
}

async function loadDocumentPreview(format, { documentId, documentNumber }) {
    const companyId = format.companyId?._id || format.companyId;
    try {
        if (format.documentType === 'SALES_ORDER') {
            const { SalesOrder } = await import('../models/salesOrder.model.js');
            const q = { companyId };
            if (documentId) q._id = documentId;
            else q.soNumber = documentNumber;
            const row = await SalesOrder.findOne(q)
                .select('soNumber soDate customerName grandTotal taxableAmount status')
                .lean();
            return row
                ? {
                    type: 'SALES_ORDER',
                    id: row._id,
                    number: row.soNumber,
                    date: row.soDate,
                    party: row.customerName,
                    total: row.grandTotal,
                    status: row.status,
                }
                : { error: 'Sales Order not found for this company' };
        }
        if (format.documentType === 'SALES_INVOICE' || format.documentType === 'ESTIMATE') {
            const { SalesInvoice } = await import('../models/salesInvoice.model.js');
            const q = { companyId };
            if (documentId) q._id = documentId;
            else q.invoiceNumber = documentNumber;
            const row = await SalesInvoice.findOne(q)
                .select('invoiceNumber invoiceDate customerName grandTotal roundedTotal status')
                .lean();
            return row
                ? {
                    type: format.documentType,
                    id: row._id,
                    number: row.invoiceNumber,
                    date: row.invoiceDate,
                    party: row.customerName,
                    total: row.roundedTotal ?? row.grandTotal,
                    status: row.status,
                }
                : { error: 'Sales Invoice not found for this company' };
        }
        if (format.documentType === 'PURCHASE_ORDER') {
            const { PurchaseOrder } = await import('../models/purchaseOrder.model.js');
            const q = { companyId };
            if (documentId) q._id = documentId;
            else q.poNumber = documentNumber;
            const row = await PurchaseOrder.findOne(q)
                .select('poNumber poDate supplierName grandTotal status')
                .lean();
            return row
                ? {
                    type: 'PURCHASE_ORDER',
                    id: row._id,
                    number: row.poNumber,
                    date: row.poDate,
                    party: row.supplierName,
                    total: row.grandTotal,
                    status: row.status,
                }
                : { error: 'Purchase Order not found for this company' };
        }
        return {
            type: format.documentType,
            message: 'Document preview loader not implemented for this type yet (metadata-only preview).',
        };
    } catch (e) {
        return { error: e.message || 'Preview document load failed' };
    }
}

export function getPrintFormatVersionRegistry() {
    return {
        statuses: PRINT_FORMAT_VERSION_STATUSES,
        statusLabels: PRINT_FORMAT_VERSION_STATUS_LABELS,
        documentTypes: PRINT_FORMAT_VERSION_DOCUMENT_TYPES,
        documentTypeLabels: PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS,
        livePrintWired: PRINT_FORMAT_VERSION_LIVE_WIRED,
        identity: 'companyId + documentType + formatVersion',
        rules: [
            'Existing live PDF/print output is unchanged.',
            'New changes must be DRAFT copies.',
            'LOCKED / DEFAULT cannot be edited directly — create a copy.',
            'Approve before set default.',
            'Company formats are isolated by companyId.',
        ],
    };
}
