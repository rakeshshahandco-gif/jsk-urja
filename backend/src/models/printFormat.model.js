import mongoose from 'mongoose';
import {
    PRINT_FORMAT_DOC_TYPES,
    PRINT_FORMAT_ORIENTATIONS,
    PRINT_FORMAT_PAPER_SIZES,
    PRINT_FORMAT_SOURCES,
    PRINT_FORMAT_STATUSES,
} from '../constants/printFormat.constants.js';

const printFormatSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        docType: { type: String, enum: PRINT_FORMAT_DOC_TYPES, required: true, index: true },
        /** Sales Invoice only — links format to a specific invoice numbering series. */
        invoiceSeriesId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InvoiceSeries',
            default: null,
            index: true,
        },
        name: { type: String, required: true, trim: true },
        status: { type: String, enum: PRINT_FORMAT_STATUSES, default: 'draft' },
        isDefault: { type: Boolean, default: false },
        source: { type: String, enum: PRINT_FORMAT_SOURCES, default: 'original' },
        copiedFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintFormat', default: null },
        paperSize: { type: String, enum: PRINT_FORMAT_PAPER_SIZES, default: 'A4' },
        orientation: { type: String, enum: PRINT_FORMAT_ORIENTATIONS, default: 'portrait' },
        margins: {
            top: { type: Number, default: 10 },
            right: { type: Number, default: 10 },
            bottom: { type: Number, default: 10 },
            left: { type: Number, default: 10 },
            unit: { type: String, default: 'mm' },
        },
        customPaper: {
            widthMm: { type: Number, default: null },
            heightMm: { type: Number, default: null },
        },
        layout: { type: mongoose.Schema.Types.Mixed, required: true },
        engineVersion: { type: Number, default: 1 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

printFormatSchema.index(
    { companyId: 1, docType: 1, name: 1, invoiceSeriesId: 1 },
    { unique: true },
);
printFormatSchema.index({ companyId: 1, docType: 1, invoiceSeriesId: 1, isDefault: 1 });

const PrintFormat = mongoose.model('PrintFormat', printFormatSchema);
export default PrintFormat;
