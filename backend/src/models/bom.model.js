import mongoose from 'mongoose';
import { TEXTILE_JOB_WORK_PROCESSES, TEXTILE_RATE_TYPES } from '../constants/textileJobWorkRate.constants.js';

const TEXTILE_BOM_LABOUR_PROCESSES = [...TEXTILE_JOB_WORK_PROCESSES, 'Finishing', 'Other'];

const textileProcessLabourSchema = new mongoose.Schema({
    processName: {
        type: String,
        required: true,
        trim: true,
        enum: TEXTILE_BOM_LABOUR_PROCESSES,
    },
    vendorWorker: { type: String, trim: true, default: '' },
    rateType: {
        type: String,
        required: true,
        enum: TEXTILE_RATE_TYPES,
    },
    qtyBasis: { type: Number, min: 0, default: 0 },
    qtyBasisUom: { type: String, trim: true, default: '' },
    rate: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
    remarks: { type: String, trim: true, default: '' },
});

const bomComponentSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    itemCode: String,
    itemName: String,
    category: String,
    uom: String,
    quantity: {
        type: Number,
        required: true,
        default: 0
    },
    componentType: {
        type: String,
        enum: ['SMD', 'TH', 'OTHER', '', 'GREY_FABRIC', 'DYED_FABRIC', 'PRINTED_FABRIC', 'TRIM', 'PACKING'],
        default: ''
    },
    rate: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number,
        default: 0
    },
    points: {
        type: Number,
        default: 0
    },
    pointsLabourCost: {
        type: Number,
        default: 0
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    }
});

const bomSchema = new mongoose.Schema({
    bomNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    finishedProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    version: {
        type: String,
        required: true,
        default: 'V1'
    },
    revisionDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['Draft', 'Approved', 'Inactive'],
        default: 'Draft'
    },
    productionQuantity: {
        type: Number,
        required: true,
        default: 1
    },
    bomType: {
        type: String,
        enum: ['Production', 'Sub-Assembly', 'Service BOM'],
        default: 'Production'
    },
    components: [bomComponentSchema],

    // Cost Summary
    totalRawMaterialCost: { type: Number, default: 0 },
    totalProcessCost: { type: Number, default: 0 },
    overheadCost: { type: Number, default: 0 },
    labourCost: { type: Number, default: 0 },
    labourCostPerPoint: { type: Number, default: 0.25 },
    totalPointsLabourCost: { type: Number, default: 0 },
    /** Textile / Handloom only — process-wise job work labour rows. */
    textileProcessLabourCosts: { type: [textileProcessLabourSchema], default: [] },
    totalTextileProcessLabourCost: { type: Number, default: 0 },
    finalProductionCostPerUnit: { type: Number, default: 0 },
    standardCostUpdatedAt: { type: Date, default: null },

    // Process Details
    processes: {
        smtAssembly: { type: Boolean, default: false },
        manualAssembly: { type: Boolean, default: false },
        testingRequired: { type: Boolean, default: false },
        qcRequired: { type: Boolean, default: false },
        packingRequired: { type: Boolean, default: false }
    },

    // Controls
    isDefault: { type: Boolean, default: false },

    scrapAccount: { type: String, trim: true },
    remarks: { type: String, trim: true },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Pre-save hook to calculate costs (optional, or handle in controller/frontend)
bomSchema.index({ finishedProductId: 1 });

const BOM = mongoose.model('BOM', bomSchema);
export { BOM };
