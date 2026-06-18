import mongoose from 'mongoose';
import {
    TEXTILE_PRODUCTION_ORDER_STATUS,
    TEXTILE_STAGE_STATUS,
} from '../constants/textileProcessRoute.constants.js';

const skipAuditSchema = new mongoose.Schema({
    stageIndex: { type: Number, required: true },
    processName: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    skippedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    skippedAt: { type: Date, default: Date.now },
}, { _id: true });

const stageCostSchema = new mongoose.Schema({
    stageIndex: { type: Number, default: 0 },
    processName: { type: String, trim: true, default: '' },
    rateType: { type: String, trim: true, default: '' },
    rate: { type: Number, default: 0, min: 0 },
    labourCost: { type: Number, default: 0, min: 0 },
    vendorCost: { type: Number, default: 0, min: 0 },
    actualCost: { type: Number, default: 0, min: 0 },
    vendorName: { type: String, trim: true, default: '' },
    recordedAt: { type: Date, default: Date.now },
}, { _id: false });

const stageStateSchema = new mongoose.Schema({
    stageIndex: { type: Number, required: true },
    sequenceNo: { type: Number, required: true },
    processName: { type: String, trim: true, default: '' },
    customProcessName: { type: String, trim: true, default: '' },
    allowSkip: { type: Boolean, default: true },
    status: { type: String, enum: TEXTILE_STAGE_STATUS, default: 'pending' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    activeChallanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileDyeingChallan', default: null },
    activeVendorName: { type: String, trim: true, default: '' },
    issuedQty: { type: Number, default: 0, min: 0 },
    returnedQty: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true, default: '' },
}, { _id: false });

const routeSnapshotStageSchema = new mongoose.Schema({
    sequenceNo: { type: Number, required: true },
    processName: { type: String, trim: true, default: '' },
    customProcessName: { type: String, trim: true, default: '' },
    allowSkip: { type: Boolean, default: true },
}, { _id: false });

const textileProductionOrderSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, trim: true, uppercase: true },
    designNo: { type: String, trim: true, default: '' },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemName: { type: String, trim: true, default: '' },
    outputItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    outputItemName: { type: String, trim: true, default: '' },
    qty: { type: Number, required: true, min: 0.0001 },
    qtyUom: { type: String, trim: true, default: 'PCS' },
    colour: { type: String, trim: true, default: '' },
    size: { type: String, trim: true, default: '' },
    lotNo: { type: String, trim: true, default: '' },
    thanNo: { type: String, trim: true, default: '' },
    processRouteId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileProcessRoute', required: true },
    routeName: { type: String, trim: true, default: '' },
    routeSnapshot: { type: [routeSnapshotStageSchema], default: [] },
    currentStageIndex: { type: Number, default: 0 },
    currentProcessName: { type: String, trim: true, default: '' },
    nextProcessName: { type: String, trim: true, default: '' },
    status: { type: String, enum: TEXTILE_PRODUCTION_ORDER_STATUS, default: 'Draft' },
    stageStates: { type: [stageStateSchema], default: [] },
    skipAudit: { type: [skipAuditSchema], default: [] },
    stageCosts: { type: [stageCostSchema], default: [] },
    totalLabourCost: { type: Number, default: 0, min: 0 },
    totalActualCost: { type: Number, default: 0, min: 0 },
    barcodeValue: { type: String, trim: true, default: '' },
    orderDate: { type: Date, default: Date.now },
    financialYear: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

textileProductionOrderSchema.index({ companyId: 1, orderNo: 1 }, { unique: true });
textileProductionOrderSchema.index({ companyId: 1, status: 1, orderDate: -1 });
textileProductionOrderSchema.index({ companyId: 1, currentProcessName: 1 });

const TextileProductionOrder = mongoose.model('TextileProductionOrder', textileProductionOrderSchema);
export { TextileProductionOrder };
