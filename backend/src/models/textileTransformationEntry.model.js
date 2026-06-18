import mongoose from 'mongoose';
import {
    TEXTILE_TRANSFORMATION_PROCESSES,
    TEXTILE_CONVERSION_UOMS,
} from '../constants/textileConversion.constants.js';

const traceabilitySchema = new mongoose.Schema(
    {
        lotNo: { type: String, trim: true, default: '' },
        rollNo: { type: String, trim: true, default: '' },
        barcode: { type: String, trim: true, default: '' },
        vendor: { type: String, trim: true, default: '' },
        worker: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const textileTransformationEntrySchema = new mongoose.Schema(
    {
        referenceNo: { type: String, required: true, trim: true },
        date: { type: Date, default: () => new Date() },
        process: { type: String, required: true, enum: TEXTILE_TRANSFORMATION_PROCESSES },
        inputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        inputQty: { type: Number, required: true, min: 0 },
        inputUom: { type: String, required: true, enum: TEXTILE_CONVERSION_UOMS },
        outputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        outputQty: { type: Number, required: true, min: 0 },
        outputUom: { type: String, required: true, enum: TEXTILE_CONVERSION_UOMS },
        conversionMasterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TextileConversionMaster',
            default: null,
        },
        lossQty: { type: Number, min: 0, default: 0 },
        lossPercent: { type: Number, min: 0, max: 100, default: 0 },
        remarks: { type: String, trim: true, default: '' },
        traceability: { type: traceabilitySchema, default: () => ({}) },
        /** Optional link to textile production lot for MRP traceability. */
        productionLotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WorkflowProductionLot',
            default: null,
        },
        financialYear: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE' },
        stockPosted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

textileTransformationEntrySchema.index({ companyId: 1, referenceNo: 1 }, { unique: true });
textileTransformationEntrySchema.index({ companyId: 1, date: -1 });
textileTransformationEntrySchema.index({ companyId: 1, process: 1, date: -1 });
textileTransformationEntrySchema.index({ companyId: 1, inputItemId: 1 });
textileTransformationEntrySchema.index({ companyId: 1, outputItemId: 1 });
textileTransformationEntrySchema.index({ 'traceability.lotNo': 1 });

const TextileTransformationEntry = mongoose.model('TextileTransformationEntry', textileTransformationEntrySchema);
export { TextileTransformationEntry };
