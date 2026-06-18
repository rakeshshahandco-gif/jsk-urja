import mongoose from 'mongoose';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '../constants/textileJobWorkChallan.constants.js';

const challanLineSchema = new mongoose.Schema({
    lineNo: { type: Number, required: true, min: 1 },
    lotNo: { type: String, trim: true, default: '' },
    thanNo: { type: String, trim: true, default: '' },
    fabricItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    fabricItemName: { type: String, trim: true, default: '' },
    fabricType: { type: String, trim: true, default: '' },
    colourInstructionType: {
        type: String,
        enum: ['FIXED_COLOUR', 'DYER_CHOICE', 'AS_PER_SAMPLE', 'AS_PER_EXPERTISE'],
        default: 'FIXED_COLOUR',
    },
    colourName: { type: String, trim: true, default: '' },
    designPattern: { type: String, trim: true, default: '' },
    issuedQty: { type: Number, default: 0, min: 0 },
    issuedUom: { type: String, trim: true, default: 'Meter' },
    issuedMeter: { type: Number, required: true, min: 0.0001 },
    meterPerPcs: { type: Number, default: 0, min: 0 },
    pcsRoundMode: {
        type: String,
        enum: ['ROUND_DOWN', 'ROUND_NEAREST', 'DECIMAL'],
        default: 'ROUND_DOWN',
    },
    expectedLossPercent: { type: Number, default: 0, min: 0, max: 100 },
    expectedPcs: { type: Number, default: 0, min: 0 },
    expectedReturnMeter: { type: Number, default: 0, min: 0 },
    expectedLossMeter: { type: Number, default: 0, min: 0 },
    labourProcessName: { type: String, trim: true, default: 'Dyeing' },
    labourRateType: {
        type: String,
        enum: ['PER_METER', 'PER_PCS', 'PER_THAN', 'FIXED_AMOUNT', ''],
        default: '',
    },
    labourRate: { type: Number, default: 0, min: 0 },
    labourQtyBasis: { type: String, trim: true, default: '' },
    labourAmount: { type: Number, default: 0, min: 0 },
    expectedOutputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    expectedOutputItemName: { type: String, trim: true, default: '' },
    expectedOutputUom: { type: String, trim: true, default: 'Meter' },
    returnedMeter: { type: Number, default: 0, min: 0 },
    returnedQty: { type: Number, default: 0, min: 0 },
    returnedUom: { type: String, trim: true, default: '' },
    lossMeter: { type: Number, default: 0, min: 0 },
    pendingMeter: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true, default: '' },
}, { _id: true });

const returnLineSchema = new mongoose.Schema({
    challanLineId: { type: mongoose.Schema.Types.ObjectId, required: true },
    lotNo: { type: String, trim: true, default: '' },
    thanNo: { type: String, trim: true, default: '' },
    colourName: { type: String, trim: true, default: '' },
    returnedQty: { type: Number, required: true, min: 0.0001 },
    returnUom: { type: String, trim: true, default: 'Meter' },
    outputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    outputItemName: { type: String, trim: true, default: '' },
    issuedMeter: { type: Number, default: 0, min: 0 },
    lossMeter: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true, default: '' },
}, { _id: true });

const returnEntrySchema = new mongoose.Schema({
    returnNo: { type: String, trim: true, required: true },
    returnDate: { type: Date, default: Date.now },
    scanBarcode: { type: String, trim: true, default: '' },
    lines: { type: [returnLineSchema], default: [] },
    totalReturnedQty: { type: Number, default: 0, min: 0 },
    totalLossMeter: { type: Number, default: 0, min: 0 },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, trim: true, default: '' },
}, { _id: true, timestamps: true });

const textileDyeingChallanSchema = new mongoose.Schema({
    processType: {
        type: String,
        enum: TEXTILE_JOB_WORK_PROCESS_TYPES,
        default: 'Dyeing',
        index: true,
    },
    challanNo: { type: String, required: true, trim: true, uppercase: true },
    issueDate: { type: Date, required: true, default: Date.now },
    dyerName: { type: String, required: true, trim: true },
    labourProcessName: { type: String, trim: true, default: 'Dyeing' },
    expectedReturnDate: { type: Date, default: null },
    remarks: { type: String, trim: true, default: '' },
    status: {
        type: String,
        enum: ['Issued', 'Partial Return', 'Closed', 'Cancelled'],
        default: 'Issued',
    },
    lines: { type: [challanLineSchema], default: [] },
    returns: { type: [returnEntrySchema], default: [] },
    totalIssuedMeter: { type: Number, default: 0, min: 0 },
    totalExpectedPcs: { type: Number, default: 0, min: 0 },
    totalExpectedReturnMeter: { type: Number, default: 0, min: 0 },
    totalExpectedLossMeter: { type: Number, default: 0, min: 0 },
    totalLabourAmount: { type: Number, default: 0, min: 0 },
    totalReturnedMeter: { type: Number, default: 0, min: 0 },
    totalPendingMeter: { type: Number, default: 0, min: 0 },
    totalLossMeter: { type: Number, default: 0, min: 0 },
    barcodeValue: { type: String, trim: true, default: '' },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileProductionOrder', default: null },
    productionOrderNo: { type: String, trim: true, default: '' },
    stageIndex: { type: Number, default: null },
    financialYear: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

textileDyeingChallanSchema.index({ companyId: 1, processType: 1, challanNo: 1 }, { unique: true });
textileDyeingChallanSchema.index({ companyId: 1, processType: 1, dyerName: 1, issueDate: -1 });
textileDyeingChallanSchema.index({ companyId: 1, processType: 1, status: 1 });
textileDyeingChallanSchema.index({ barcodeValue: 1 });

const TextileDyeingChallan = mongoose.model('TextileDyeingChallan', textileDyeingChallanSchema);
export { TextileDyeingChallan };
