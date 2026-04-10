import mongoose from 'mongoose';

// ─────────────────────────────────────────────
// Constants – single source of truth for stages
// ─────────────────────────────────────────────
const PRODUCTION_STAGES = [
    { seq: 1, stageName: 'PCB', isQcGate: false, isTestGate: false },
    { seq: 2, stageName: 'SMD Pick & Place', isQcGate: false, isTestGate: false },
    { seq: 3, stageName: 'TH Mounting', isQcGate: false, isTestGate: false },
    { seq: 4, stageName: 'Wave Soldering', isQcGate: false, isTestGate: false },
    { seq: 5, stageName: 'Touch Up', isQcGate: false, isTestGate: false },
    { seq: 6, stageName: 'Wire Insert', isQcGate: false, isTestGate: false },
    { seq: 7, stageName: '1st QC', isQcGate: true, isTestGate: false },
    { seq: 8, stageName: 'Dummy Load Testing', isQcGate: false, isTestGate: true },
    { seq: 9, stageName: 'Final QC', isQcGate: true, isTestGate: false },
];

// ─────────────────────────────────────────────
// Checklist item (for QC/Testing stages)
// ─────────────────────────────────────────────
const checklistItemSchema = new mongoose.Schema({
    item: { type: String, required: true },
    result: { type: String, /* enum: ['Pending', 'Pass', 'Fail'], */ default: 'Pending' },
    remarks: { type: String, default: '' },
}, { _id: false });

// ─────────────────────────────────────────────
// Dummy Load Test data
// ─────────────────────────────────────────────
const testDataSchema = new mongoose.Schema({
    inputVoltageMin: { type: Number },
    inputVoltageMax: { type: Number },
    outputVoltage: { type: Number },
    outputCurrent: { type: Number },
    loadPercent: { type: Number },
    temperature: { type: Number },
    burninMinutes: { type: Number },
    result: { type: String, /* enum: ['Pass', 'Fail', 'Pending'], */ default: 'Pending' },
    resultSummary: { type: String, default: '' },
    testerName: { type: String, default: '' },
    testedAt: { type: Date },
}, { _id: false });

// ─────────────────────────────────────────────
// Production Log sub-document (for tracking multiple runs)
// ─────────────────────────────────────────────
const productionLogSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    shift: { type: String, trim: true, default: '' },
    operator: { type: String, trim: true, default: '' },
    inputQty: { type: Number, default: 0 },
    outputQty: { type: Number, default: 0 }, // Good Output
    reworkQty: { type: Number, default: 0 },
    rejectionQty: { type: Number, default: 0 },
    rejectionReason: { type: String, trim: true, default: '' },

    // QC specific details
    qcPassedQty: { type: Number, default: 0 },
    qcRejectedQty: { type: Number, default: 0 },
    qcReworkQty: { type: Number, default: 0 },

    // For Pick & Place / TH Mounting shortages
    missingComponents: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        itemCode: String,
        itemName: String,
        quantity: Number,
        remarks: String
    }],

    remarks: { type: String, trim: true, default: '' }
}, { timestamps: true });

// ─────────────────────────────────────────────
// Stage sub-document
// ─────────────────────────────────────────────
const stageSchema = new mongoose.Schema({
    seq: { type: Number, required: true },
    stageName: { type: String, required: true },
    isQcGate: { type: Boolean, default: false },
    isTestGate: { type: Boolean, default: false },
    status: {
        type: String,
        // enum: ['Not Started', 'Running', 'Completed', 'QC Hold', 'Failed', 'Rework'],
        default: 'Not Started',
    },
    inputQty: { type: Number, default: 0 },
    outputQty: { type: Number, default: 0 },
    reworkQty: { type: Number, default: 0 },
    rejectionQty: { type: Number, default: 0 },
    rejectionReason: { type: String, default: '' },
    productionLogs: [productionLogSchema],
    checklist: [checklistItemSchema],
    testData: testDataSchema,
    remarks: { type: String, default: '' },
    attachments: [{ type: String }],
}, { _id: true });

// ─────────────────────────────────────────────
// Material / BOM component status
// ─────────────────────────────────────────────
const materialStatusSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    itemCode: { type: String },
    itemName: { type: String },
    itemType: String, // PCB, SMD, TH, etc.
    uom: { type: String },
    requiredQty: { type: Number, default: 0 },
    availableStock: { type: Number, default: 0 },
    reservedQty: { type: Number, default: 0 },
    shortQty: { type: Number, default: 0 },
    isMandatory: { type: Boolean, default: true },
    isCritical: { type: Boolean, default: false },
    alternateAvailable: { type: Boolean, default: false },
    consumptionStage: { type: String, default: '' },
    procurementStatus: {
        type: String,
        // enum: ['Not Ordered', 'Ordered', 'In Transit', 'Received'],
        default: 'Not Ordered',
    },
    remarks: { type: String, default: '' },
}, { _id: true });

// ─────────────────────────────────────────────
// Work Order (main document)
// ─────────────────────────────────────────────
const workOrderSchema = new mongoose.Schema({
    woNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
    },
    bomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BOM',
        required: true,
    },
    finishedProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
    },
    finishedProductName: { type: String },
    bomVersion: { type: String },

    targetQty: { type: Number, required: true, default: 1 },
    priority: {
        type: String,
        // enum: ['Low', 'Medium', 'High', 'Urgent'],
        default: 'Medium',
    },
    plannedStart: { type: Date },
    plannedEnd: { type: Date },
    actualStart: { type: Date },
    actualEnd: { type: Date },
    supervisor: { type: String, default: '' },

    status: {
        type: String,
        /* enum: [
            'Draft',
            'Released',
            'In Process',
            'WIP – Waiting Material',
            'On Hold',
            'Completed',
            'Closed',
        ], */
        default: 'Draft',
    },

    stages: [stageSchema],
    materialStatus: [materialStatusSchema],

    // WIP tracking
    wip: {
        isOnHold: { type: Boolean, default: false },
        holdReason: { type: String, default: '' },
        missingMandatoryItems: [{ type: String }],
        eta: { type: Date },
    },

    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
}, { timestamps: true });

workOrderSchema.index({ status: 1 });
workOrderSchema.index({ bomId: 1 });
workOrderSchema.index({ createdAt: -1 });
workOrderSchema.index({ financialYear: 1 });

const WorkOrder = mongoose.model('WorkOrder', workOrderSchema);
export { WorkOrder, PRODUCTION_STAGES };
