import mongoose from 'mongoose';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '../constants/textileJobWorkChallan.constants.js';
import { PROCESS_OUTPUT_STATUS } from '../constants/textileProcessOutput.constants.js';

const textileProcessOutputStockSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    processType: { type: String, enum: TEXTILE_JOB_WORK_PROCESS_TYPES, required: true, index: true },
    warehouseLabel: { type: String, trim: true, default: '' },

    sourceChallanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileDyeingChallan', required: true },
    sourceChallanNo: { type: String, trim: true, required: true },
    sourceReturnId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceReturnNo: { type: String, trim: true, required: true },
    sourceChallanLineId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceReturnLineId: { type: mongoose.Schema.Types.ObjectId, default: null },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, trim: true, default: '' },
    itemName: { type: String, trim: true, default: '' },

    qtyUom: { type: String, trim: true, default: 'PCS' },
    qtyOriginal: { type: Number, default: 0, min: 0 },
    qtyConsumed: { type: Number, default: 0, min: 0 },
    qtyBalance: { type: Number, default: 0, min: 0 },

    meterOriginal: { type: Number, default: 0, min: 0 },
    meterConsumed: { type: Number, default: 0, min: 0 },
    meterBalance: { type: Number, default: 0, min: 0 },
    meterPerPcs: { type: Number, default: 0, min: 0 },

    lotNo: { type: String, trim: true, default: '' },
    thanNo: { type: String, trim: true, default: '' },
    colour: { type: String, trim: true, default: '' },
    design: { type: String, trim: true, default: '' },
    size: { type: String, trim: true, default: '' },

    previousVendor: { type: String, trim: true, default: '' },
    issueDate: { type: Date, default: null },
    returnDate: { type: Date, default: null },
    labourCost: { type: Number, default: 0, min: 0 },
    barcodeValue: { type: String, trim: true, default: '' },
    traceId: { type: String, trim: true, default: '' },

    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileProductionOrder', default: null },
    productionOrderNo: { type: String, trim: true, default: '' },
    stageIndex: { type: Number, default: null },

    status: { type: String, enum: PROCESS_OUTPUT_STATUS, default: 'Available', index: true },
    nextAction: { type: String, trim: true, default: 'KEEP_OUTPUT_STOCK' },

    financialYear: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

textileProcessOutputStockSchema.index({ companyId: 1, processType: 1, status: 1, qtyBalance: 1 });
textileProcessOutputStockSchema.index({ companyId: 1, sourceChallanId: 1, sourceReturnNo: 1 });

const TextileProcessOutputStock = mongoose.model('TextileProcessOutputStock', textileProcessOutputStockSchema);
export { TextileProcessOutputStock };
