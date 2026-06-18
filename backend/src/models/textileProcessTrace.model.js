import mongoose from 'mongoose';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '../constants/textileJobWorkChallan.constants.js';

const textileProcessTraceSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    traceId: { type: String, trim: true, required: true, index: true },
    sequenceNo: { type: Number, default: 1, min: 1 },

    processType: { type: String, enum: TEXTILE_JOB_WORK_PROCESS_TYPES, required: true },
    vendorName: { type: String, trim: true, default: '' },
    issueDate: { type: Date, default: null },
    returnDate: { type: Date, default: null },

    challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileDyeingChallan', default: null },
    challanNo: { type: String, trim: true, default: '' },
    returnNo: { type: String, trim: true, default: '' },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemName: { type: String, trim: true, default: '' },
    qtyIssued: { type: Number, default: 0, min: 0 },
    qtyReturned: { type: Number, default: 0, min: 0 },
    qtyUom: { type: String, trim: true, default: 'PCS' },
    labourCost: { type: Number, default: 0, min: 0 },

    lotNo: { type: String, trim: true, default: '' },
    thanNo: { type: String, trim: true, default: '' },
    colour: { type: String, trim: true, default: '' },
    design: { type: String, trim: true, default: '' },
    size: { type: String, trim: true, default: '' },
    barcodeValue: { type: String, trim: true, default: '' },

    parentTraceId: { type: String, trim: true, default: '' },
    outputStockId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileProcessOutputStock', default: null },
    eventType: { type: String, trim: true, default: 'RETURN' },
}, { timestamps: true });

textileProcessTraceSchema.index({ companyId: 1, traceId: 1, sequenceNo: 1 });
textileProcessTraceSchema.index({ companyId: 1, barcodeValue: 1 });

const TextileProcessTrace = mongoose.model('TextileProcessTrace', textileProcessTraceSchema);
export { TextileProcessTrace };
