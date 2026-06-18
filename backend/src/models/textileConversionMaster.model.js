import mongoose from 'mongoose';
import {
    TEXTILE_CONVERSION_UOMS,
    TEXTILE_FORMULA_TYPES,
} from '../constants/textileConversion.constants.js';

const textileConversionMasterSchema = new mongoose.Schema(
    {
        conversionName: { type: String, required: true, trim: true },
        inputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        inputUom: { type: String, required: true, enum: TEXTILE_CONVERSION_UOMS },
        outputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        outputUom: { type: String, required: true, enum: TEXTILE_CONVERSION_UOMS },
        formulaType: { type: String, enum: TEXTILE_FORMULA_TYPES, default: 'RATIO' },
        /** For RATIO: input units per 1 output unit (e.g. 5 Meter = 1 PCS). */
        inputQtyPerOutput: { type: Number, min: 0, default: 0 },
        conversionFormula: { type: String, trim: true, default: '' },
        expectedOutputQty: { type: Number, min: 0, default: 0 },
        expectedLossPercent: { type: Number, min: 0, max: 100, default: 0 },
        remarks: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

textileConversionMasterSchema.index({ companyId: 1, conversionName: 1 });
textileConversionMasterSchema.index({ companyId: 1, inputItemId: 1, outputItemId: 1, isActive: 1 });

const TextileConversionMaster = mongoose.model('TextileConversionMaster', textileConversionMasterSchema);
export { TextileConversionMaster };
