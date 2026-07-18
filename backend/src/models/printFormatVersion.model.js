import mongoose from 'mongoose';
import {
    PRINT_FORMAT_VERSION_DOCUMENT_TYPES,
    PRINT_FORMAT_VERSION_ORIENTATIONS,
    PRINT_FORMAT_VERSION_PAPER_SIZES,
    PRINT_FORMAT_VERSION_STATUSES,
    defaultLayoutSnapshot,
} from '../constants/printFormatVersion.constants.js';

/**
 * Company-wise print format version registry.
 * Does NOT replace or alter live PrintFormat / pdf.service.js output.
 * Unique identity: companyId + documentType + formatVersion
 */
const printFormatVersionSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: [true, 'Company is required'],
            index: true,
        },
        documentType: {
            type: String,
            enum: PRINT_FORMAT_VERSION_DOCUMENT_TYPES,
            required: [true, 'Document type is required'],
            index: true,
        },
        formatVersion: {
            type: String,
            required: [true, 'Format version is required'],
            trim: true,
            maxlength: 80,
        },
        name: {
            type: String,
            required: [true, 'Format name is required'],
            trim: true,
            maxlength: 160,
        },
        status: {
            type: String,
            enum: PRINT_FORMAT_VERSION_STATUSES,
            default: 'DRAFT',
            index: true,
        },
        /** True only when status is DEFAULT (denormalized for queries). */
        isDefault: { type: Boolean, default: false, index: true },
        paperSize: {
            type: String,
            enum: PRINT_FORMAT_VERSION_PAPER_SIZES,
            default: 'A4',
        },
        orientation: {
            type: String,
            enum: PRINT_FORMAT_VERSION_ORIENTATIONS,
            default: 'portrait',
        },
        margins: {
            top: { type: Number, default: 10 },
            right: { type: Number, default: 10 },
            bottom: { type: Number, default: 10 },
            left: { type: Number, default: 10 },
            unit: { type: String, default: 'mm' },
        },
        /** Layout metadata snapshot — not applied to live PDF in Phase 5. */
        layoutSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: () => defaultLayoutSnapshot('SALES_ORDER'),
        },
        copiedFromId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrintFormatVersion',
            default: null,
        },
        /** Optional links to Phase 2/3 registries */
        formPrintLockId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FormPrintLock',
            default: null,
        },
        goldenReferenceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GoldenReference',
            default: null,
        },
        notes: { type: String, trim: true, default: '', maxlength: 4000 },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedDate: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        lockedDate: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        lastChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        /**
         * Hard flag — consumers must not use this for live print until a future phase
         * explicitly wires and enables it.
         */
        livePrintEnabled: { type: Boolean, default: false },
    },
    { timestamps: true, disableTenant: true },
);

printFormatVersionSchema.index(
    { companyId: 1, documentType: 1, formatVersion: 1 },
    { unique: true },
);
printFormatVersionSchema.index({ companyId: 1, documentType: 1, status: 1 });
printFormatVersionSchema.index({ companyId: 1, documentType: 1, isDefault: 1 });

const PrintFormatVersion = mongoose.model('PrintFormatVersion', printFormatVersionSchema);
export { PrintFormatVersion };
