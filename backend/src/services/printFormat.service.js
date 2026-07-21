import mongoose from 'mongoose';
import PrintFormat from '../models/printFormat.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { ApiError } from '../utils/ApiError.js';
import {
    BLANK_PRINT_LAYOUT,
    getOriginalPrintLayout,
    LIVE_PRINT_FORMAT_STATUS,
    PRINT_FORMAT_DOC_TYPES,
    PRINT_READ_ONLY_DATA_FIELDS,
    buildLayoutPreviewDocument,
} from '../constants/printFormat.constants.js';
import { updatePrintDesignerSettings } from './printDesignerSettings.service.js';

export class PrintFormatService {
    static assertDocType(docType) {
        if (!PRINT_FORMAT_DOC_TYPES.includes(docType)) {
            throw new ApiError(400, `Invalid document type. Allowed: ${PRINT_FORMAT_DOC_TYPES.join(', ')}`);
        }
    }

    static async list(companyId, docType, invoiceSeriesId = null) {
        const filter = { companyId };
        if (docType) {
            this.assertDocType(docType);
            filter.docType = docType;
        }
        if (docType === 'Sales Invoice' && invoiceSeriesId) {
            filter.invoiceSeriesId = invoiceSeriesId;
        }
        return PrintFormat.find(filter).sort({ isDefault: -1, updatedAt: -1 }).lean();
    }

    static async getById(companyId, id) {
        const format = await PrintFormat.findOne({ _id: id, companyId }).lean();
        if (!format) throw new ApiError(404, 'Print format not found');
        return format;
    }

    /**
     * Active Approved + Default for company+docType, or null → built-in original print.
     * Once a format is Active Default, live print/PDF must use it.
     * (Company designer toggle gates the Designer UI / setting defaults — not silent ignore of Active Default.)
     */
    static async getActiveDefault(companyId, docType, invoiceSeriesId = null) {
        this.assertDocType(docType);

        const filter = {
            companyId,
            docType,
            isDefault: true,
            status: LIVE_PRINT_FORMAT_STATUS,
        };
        if (docType === 'Sales Invoice') {
            filter.invoiceSeriesId = invoiceSeriesId
                ? new mongoose.Types.ObjectId(String(invoiceSeriesId))
                : null;
        }
        const format = await PrintFormat.findOne(filter).lean();
        return format || null;
    }

    /**
     * Clear Active Default on draft, legacy published, or original mirror formats.
     * Does not delete format records.
     */
    static async sanitizeInvalidDefaults() {
        const result = await PrintFormat.updateMany(
            {
                isDefault: true,
                $or: [
                    { status: 'draft' },
                    { status: 'published' },
                    // Do NOT clear Approved Active Defaults that originated from Pull Original.
                    // Those are valid live formats once approved + set default.
                    { status: { $nin: [LIVE_PRINT_FORMAT_STATUS] } },
                ],
            },
            { $set: { isDefault: false } },
        );
        return result.modifiedCount || 0;
    }

    static async createFromLayout(companyId, userId, payload) {
        const { docType, name, layout, source = 'original', status = 'draft', ...rest } = payload;
        this.assertDocType(docType);
        if (!name?.trim()) throw new ApiError(400, 'Format name is required');

        const doc = await PrintFormat.create({
            companyId,
            docType,
            name: name.trim(),
            layout,
            source,
            status,
            createdBy: userId,
            updatedBy: userId,
            ...rest,
        });
        return doc.toObject();
    }

    static async pullOriginal(companyId, userId, docType, name, invoiceSeriesId = null) {
        let series = null;
        if (docType === 'Sales Invoice') {
            if (!invoiceSeriesId) {
                throw new ApiError(400, 'Invoice series is required for Sales Invoice print formats');
            }
            series = await InvoiceSeries.findById(invoiceSeriesId).lean();
            if (!series || series.isActive === false) {
                throw new ApiError(400, 'Invalid or inactive invoice series');
            }
        }

        const layout = getOriginalPrintLayout(docType);
        const formatName = name?.trim()
            || (series ? `Original ${series.seriesName}` : `Original ${docType}`);
        const seriesOid = docType === 'Sales Invoice' && invoiceSeriesId
            ? new mongoose.Types.ObjectId(String(invoiceSeriesId))
            : null;

        const layoutPayload = {
            name: formatName,
            layout,
            source: 'original',
            paperSize: layout.paperSize,
            orientation: layout.orientation,
            margins: layout.margins,
            customPaper: layout.customPaper,
            engineVersion: layout.engineVersion,
            invoiceSeriesId: seriesOid,
            updatedBy: userId,
        };

        let existing = await PrintFormat.findOne({
            companyId,
            docType,
            name: formatName,
            invoiceSeriesId: seriesOid,
        });

        // Legacy row from before series linking (null invoiceSeriesId, same name).
        if (!existing && docType === 'Sales Invoice' && seriesOid) {
            existing = await PrintFormat.findOne({
                companyId,
                docType,
                name: formatName,
                $or: [{ invoiceSeriesId: null }, { invoiceSeriesId: { $exists: false } }],
            });
        }

        if (existing) {
            Object.assign(existing, layoutPayload);
            await existing.save();
            return existing.toObject();
        }

        try {
            return await this.createFromLayout(companyId, userId, {
                docType,
                ...layoutPayload,
                status: 'draft',
                createdBy: userId,
            });
        } catch (err) {
            if (err.code !== 11000) throw err;
            const dup = await PrintFormat.findOne({ companyId, docType, name: formatName })
                .sort({ updatedAt: -1 });
            if (!dup) {
                throw new ApiError(
                    409,
                    `Print format "${formatName}" already exists. Open it from Saved Formats or delete it first.`,
                );
            }
            Object.assign(dup, layoutPayload);
            await dup.save();
            return dup.toObject();
        }
    }

    static async pullBlank(companyId, userId, docType, name) {
        const layout = BLANK_PRINT_LAYOUT(docType);
        return this.createFromLayout(companyId, userId, {
            docType,
            name: name || `Blank ${docType}`,
            layout,
            source: 'blank',
            paperSize: layout.paperSize,
            orientation: layout.orientation,
            margins: layout.margins,
            engineVersion: layout.engineVersion,
        });
    }

    static async copyExisting(companyId, userId, sourceId, name) {
        const source = await this.getById(companyId, sourceId);
        const layout = JSON.parse(JSON.stringify(source.layout));
        return this.createFromLayout(companyId, userId, {
            docType: source.docType,
            name: name || `${source.name} (Copy)`,
            layout,
            source: 'copy',
            copiedFromId: source._id,
            paperSize: source.paperSize,
            orientation: source.orientation,
            margins: source.margins,
            customPaper: source.customPaper,
            engineVersion: source.engineVersion,
            invoiceSeriesId: source.invoiceSeriesId || null,
        });
    }

    /**
     * Import a previously exported print-format JSON as a new DRAFT (does not activate live print).
     */
    static async importFromExport(companyId, userId, payload = {}) {
        const docType = payload.docType;
        this.assertDocType(docType);
        const name = String(payload.name || '').trim() || `Imported ${docType}`;
        const layout = payload.layout && typeof payload.layout === 'object'
            ? JSON.parse(JSON.stringify(payload.layout))
            : getOriginalPrintLayout(docType);
        return this.createFromLayout(companyId, userId, {
            docType,
            name,
            layout,
            source: 'import',
            status: 'draft',
            paperSize: payload.paperSize || layout.paperSize || 'A4',
            orientation: payload.orientation || layout.orientation || 'portrait',
            margins: payload.margins || layout.margins,
            customPaper: payload.customPaper || null,
            engineVersion: layout.engineVersion || 3,
            invoiceSeriesId: payload.invoiceSeriesId || null,
        });
    }

    static async update(companyId, userId, id, updates) {
        const format = await PrintFormat.findOne({ _id: id, companyId });
        if (!format) throw new ApiError(404, 'Print format not found');

        const allowed = [
            'name', 'status', 'paperSize', 'orientation', 'margins', 'customPaper', 'layout',
        ];
        for (const key of allowed) {
            if (updates[key] !== undefined) format[key] = updates[key];
        }
        format.updatedBy = userId;
        await format.save();
        return format.toObject();
    }

    static async saveDraft(companyId, userId, id, updates = {}) {
        const format = await PrintFormat.findOne({ _id: id, companyId });
        if (!format) throw new ApiError(404, 'Print format not found');
        const allowed = [
            'name', 'paperSize', 'orientation', 'margins', 'customPaper', 'layout',
        ];
        for (const key of allowed) {
            if (updates[key] !== undefined) format[key] = updates[key];
        }
        format.status = 'draft';
        format.isDefault = false;
        format.updatedBy = userId;
        await format.save();
        return format.toObject();
    }

    static async approveFormat(companyId, userId, id) {
        const format = await PrintFormat.findOne({ _id: id, companyId });
        if (!format) throw new ApiError(404, 'Print format not found');
        format.status = LIVE_PRINT_FORMAT_STATUS;
        format.updatedBy = userId;
        await format.save();
        return format.toObject();
    }

    static async setAsDefault(companyId, userId, id) {
        const format = await PrintFormat.findOne({ _id: id, companyId });
        if (!format) throw new ApiError(404, 'Print format not found');
        if (format.status !== LIVE_PRINT_FORMAT_STATUS) {
            throw new ApiError(
                400,
                'Format must be Approved before it can be set as Active Default. Save draft, then click Approve.',
            );
        }

        await PrintFormat.updateMany(
            {
                companyId,
                docType: format.docType,
                invoiceSeriesId: format.invoiceSeriesId || null,
                isDefault: true,
            },
            { $set: { isDefault: false, updatedBy: userId } },
        );
        format.isDefault = true;
        // Promote away from Pull-Original "golden" identity so live print/PDF consume this layout.
        if (format.source === 'original') {
            format.source = 'custom';
        }
        if (format.layout && typeof format.layout === 'object') {
            const layout = format.layout.toObject ? format.layout.toObject() : { ...format.layout };
            if (layout.source === 'original') layout.source = 'custom';
            if (!layout.engineVersion || layout.engineVersion < 2) layout.engineVersion = 3;
            format.layout = layout;
            format.markModified('layout');
        }
        format.updatedBy = userId;
        await format.save();

        // Keep company setting aligned: Active Default implies custom designer layouts are live.
        try {
            await updatePrintDesignerSettings(companyId, userId, { enableCustomPrintDesigner: true });
        } catch (e) {
            console.warn('[PrintFormat] enable designer on setDefault skipped:', e.message);
        }

        return format.toObject();
    }

    static async remove(companyId, id) {
        const format = await PrintFormat.findOneAndDelete({ _id: id, companyId });
        if (!format) throw new ApiError(404, 'Print format not found');
        return format;
    }

    static escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** Build alternate SO number strings from refs like 26-27/069 */
    static expandSoNumberVariants(ref) {
        const trimmed = String(ref || '').trim();
        const variants = new Set([trimmed]);
        const m = trimmed.match(/^(\d{2}-\d{2})\/(\d+)$/i);
        if (!m) return [...variants];

        const prefix = m[1];
        const seq = parseInt(m[2], 10);
        if (!Number.isFinite(seq)) return [...variants];

        variants.add(`${prefix}/${seq}`);
        variants.add(`${prefix}/${String(seq).padStart(2, '0')}`);
        variants.add(`${prefix}/${String(seq).padStart(3, '0')}`);
        return [...variants];
    }

    static fyFromSoPrefix(prefix) {
        const m = String(prefix || '').match(/^(\d{2})-(\d{2})$/);
        if (!m) return null;
        return `20${m[1]}-20${m[2]}`;
    }

    static activeDocFilter() {
        return { isDeleted: { $ne: true } };
    }

    /** Resolve sample by MongoDB id or document number (e.g. SO 26-27/069). */
    static async resolveSampleDocument(companyId, docType, sampleRef) {
        const ref = String(sampleRef || '').trim();
        if (!ref) return null;

        const active = this.activeDocFilter();
        const isObjectId = mongoose.Types.ObjectId.isValid(ref)
            && String(new mongoose.Types.ObjectId(ref)) === ref;

        if (docType === 'Sales Order') {
            if (isObjectId) {
                return SalesOrder.findOne({ _id: ref, ...active }).lean();
            }

            for (const candidate of this.expandSoNumberVariants(ref)) {
                const exact = await SalesOrder.findOne({ soNumber: candidate, ...active }).lean();
                if (exact) return exact;
                const rx = new RegExp(`^${this.escapeRegex(candidate)}$`, 'i');
                const ci = await SalesOrder.findOne({ soNumber: rx, ...active }).sort({ createdAt: -1 }).lean();
                if (ci) return ci;
            }

            const m = ref.match(/^(\d{2}-\d{2})\/(\d+)$/i);
            if (m) {
                const financialYear = this.fyFromSoPrefix(m[1]);
                const sequenceNumber = parseInt(m[2], 10);
                if (financialYear && Number.isFinite(sequenceNumber)) {
                    const bySeq = await SalesOrder.findOne({
                        ...active,
                        financialYear,
                        sequenceNumber,
                    }).sort({ createdAt: -1 }).lean();
                    if (bySeq) return bySeq;
                }
            }

            const partial = new RegExp(this.escapeRegex(ref), 'i');
            return SalesOrder.findOne({ soNumber: partial, ...active }).sort({ createdAt: -1 }).lean();
        }

        if (isObjectId) {
            return SalesInvoice.findOne({ _id: ref, ...active }).lean();
        }

        for (const candidate of this.expandSoNumberVariants(ref)) {
            const rx = new RegExp(`^${this.escapeRegex(candidate)}$`, 'i');
            const hit = await SalesInvoice.findOne({
                ...active,
                $or: [
                    { invoiceNumber: candidate },
                    { displayInvoiceNumber: candidate },
                    { invoiceNumber: rx },
                    { displayInvoiceNumber: rx },
                ],
            }).sort({ createdAt: -1 }).lean();
            if (hit) return hit;
        }

        const partial = new RegExp(this.escapeRegex(ref), 'i');
        return SalesInvoice.findOne({
            ...active,
            $or: [
                { invoiceNumber: partial },
                { displayInvoiceNumber: partial },
            ],
        }).sort({ createdAt: -1 }).lean();
    }

    static async suggestSampleRef(docType, invoiceSeriesId = null) {
        const active = this.activeDocFilter();
        if (docType === 'Sales Order') {
            const golden = await SalesOrder.findOne({ soNumber: '26-27/069', ...active }).lean();
            if (golden) return '26-27/069';
            const latest = await SalesOrder.findOne({ soNumber: /^26-27\//i, ...active })
                .sort({ sequenceNumber: -1, createdAt: -1 })
                .select('soNumber')
                .lean();
            if (latest?.soNumber) return latest.soNumber;
            const any = await SalesOrder.findOne(active).sort({ createdAt: -1 }).select('soNumber').lean();
            return any?.soNumber || '';
        }
        const invFilter = { ...active };
        if (invoiceSeriesId) {
            invFilter.seriesId = new mongoose.Types.ObjectId(String(invoiceSeriesId));
        }
        const latestInv = await SalesInvoice.findOne(invFilter)
            .sort({ createdAt: -1 })
            .select('displayInvoiceNumber invoiceNumber')
            .lean();
        return latestInv?.displayInvoiceNumber || latestInv?.invoiceNumber || '';
    }

    /** Recent SO / invoice numbers for Print Format Designer preview picker. */
    static async listSampleDocumentRefs(companyId, docType, { invoiceSeriesId = null, limit = 80 } = {}) {
        this.assertDocType(docType);
        const active = this.activeDocFilter();
        const cap = Math.min(Math.max(Number(limit) || 80, 1), 100);

        if (docType === 'Sales Order') {
            const rows = await SalesOrder.find(active)
                .sort({ createdAt: -1 })
                .limit(cap)
                .select('soNumber customerName soDate')
                .lean();
            return rows.map((r) => ({
                ref: r.soNumber,
                label: `${r.soNumber} — ${r.customerName || 'Customer'}`,
                date: r.soDate,
            }));
        }

        const invFilter = { ...active };
        if (invoiceSeriesId) {
            invFilter.seriesId = new mongoose.Types.ObjectId(String(invoiceSeriesId));
        }
        const rows = await SalesInvoice.find(invFilter)
            .sort({ createdAt: -1 })
            .limit(cap)
            .select('invoiceNumber displayInvoiceNumber customerName invoiceDate')
            .lean();
        return rows.map((r) => ({
            ref: r.displayInvoiceNumber || r.invoiceNumber,
            label: `${r.displayInvoiceNumber || r.invoiceNumber} — ${r.customerName || 'Customer'}`,
            date: r.invoiceDate,
        }));
    }

    static enrichSampleDocument(docType, doc) {
        if (!doc || doc._layoutPreview) return doc;
        const out = { ...doc };
        if (docType === 'Sales Invoice') {
            out.displayInvoiceNumber = out.displayInvoiceNumber || out.invoiceNumber;
            out.gstApplicable = out.gstApplicable !== false;
            if (out.gstType === 'IGST' && !out.totalIgst && out.totalTaxAmount) {
                out.totalIgst = out.totalTaxAmount;
            }
            if (out.gstType !== 'IGST' && out.totalTaxAmount && !out.totalCgst) {
                out.totalCgst = out.totalCgst ?? out.totalTaxAmount / 2;
                out.totalSgst = out.totalSgst ?? out.totalTaxAmount / 2;
            }
        }
        return out;
    }

    static async getPreviewPayload(companyId, formatId, sampleRef) {
        const format = await this.getById(companyId, formatId);
        let sampleDocument = null;
        let isLayoutPreview = false;
        const ref = String(sampleRef || '').trim();

        if (ref) {
            sampleDocument = await this.resolveSampleDocument(companyId, format.docType, ref);
        }
        if (!sampleDocument) {
            sampleDocument = buildLayoutPreviewDocument(format.docType);
            isLayoutPreview = true;
        } else {
            sampleDocument = this.enrichSampleDocument(format.docType, sampleDocument);
        }

        return {
            format,
            readOnlyFields: PRINT_READ_ONLY_DATA_FIELDS[format.docType] || [],
            sampleDocument,
            isLayoutPreview,
            usesBuiltInRenderer: format.layout?.source === 'original' || !format.isDefault,
            note: isLayoutPreview
                ? 'Layout preview with sample data. Only block positions and styles are saved — not document values.'
                : 'Preview shows layout configuration only. Calculations (GST, totals, qty×rate) are read from document data and cannot be changed here.',
        };
    }

    static getOriginalTemplateMeta(docType) {
        this.assertDocType(docType);
        return getOriginalPrintLayout(docType);
    }
}
