import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
    {
        action: { type: String, required: true, trim: true },
        stageIndex: { type: Number, default: null },
        stageName: { type: String, trim: true, default: '' },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        performedAt: { type: Date, default: Date.now },
    },
    { _id: true },
);

const dyeingIssueSchema = new mongoose.Schema(
    {
        issueNo: { type: String, trim: true, default: '' },
        dyeingChallanNo: { type: String, trim: true, default: '' },
        dyerName: { type: String, trim: true, default: '' },
        meterIssued: { type: Number, required: true, min: 0.0001 },
        processName: { type: String, trim: true, default: 'Dyeing' },
        vendorWorker: { type: String, trim: true, default: '' },
        partyType: { type: String, enum: ['vendor', 'worker'], default: 'vendor' },
        rateType: { type: String, trim: true, default: '' },
        rateApplied: { type: Number, default: 0, min: 0 },
        labourCost: { type: Number, default: 0, min: 0 },
        rateMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileJobWorkRate', default: null },
        issuedAt: { type: Date, default: Date.now },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        remarks: { type: String, trim: true, default: '' },
    },
    { _id: true },
);

const stageLabourCostSchema = new mongoose.Schema(
    {
        stageIndex: { type: Number, default: 0 },
        stageName: { type: String, trim: true, default: '' },
        processName: { type: String, trim: true, default: '' },
        vendorWorker: { type: String, trim: true, default: '' },
        partyType: { type: String, enum: ['vendor', 'worker'], default: 'worker' },
        rateType: { type: String, trim: true, default: '' },
        rateApplied: { type: Number, default: 0, min: 0 },
        quantity: { type: Number, default: 0, min: 0 },
        labourCost: { type: Number, default: 0, min: 0 },
        rateMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'TextileJobWorkRate', default: null },
        recordedAt: { type: Date, default: Date.now },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        remarks: { type: String, trim: true, default: '' },
    },
    { _id: true },
);

const dyeingReturnSchema = new mongoose.Schema(
    {
        returnNo: { type: String, trim: true, default: '' },
        dyeingChallanNo: { type: String, trim: true, default: '' },
        dyerName: { type: String, trim: true, default: '' },
        meterReturned: { type: Number, required: true, min: 0.0001 },
        shortageWastage: { type: Number, default: 0, min: 0 },
        returnedAt: { type: Date, default: Date.now },
        returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        remarks: { type: String, trim: true, default: '' },
    },
    { _id: true },
);

const stageWipSchema = new mongoose.Schema(
    {
        stageIndex: { type: Number, default: 0 },
        stageName: { type: String, trim: true, default: '' },
        wipMeter: { type: Number, default: 0, min: 0 },
        status: { type: String, trim: true, default: 'pending' },
    },
    { _id: false },
);

const textileDetailsSchema = new mongoose.Schema(
    {
        fabricName: { type: String, trim: true, default: '' },
        fabricQuality: { type: String, trim: true, default: '' },
        fabricType: { type: String, trim: true, default: '' },
        gsm: { type: Number, default: null, min: 0 },
        width: { type: Number, default: null, min: 0 },
        meter: { type: Number, default: 0, min: 0 },
        rollNo: { type: String, trim: true, default: '' },
        barcode: { type: String, trim: true, default: '' },
        colour: { type: String, trim: true, default: '' },
        shade: { type: String, trim: true, default: '' },
        dyerName: { type: String, trim: true, default: '' },
        dyeingChallanNo: { type: String, trim: true, default: '' },
        greyFabricMeter: { type: Number, default: 0, min: 0 },
        availableMeter: { type: Number, default: 0, min: 0 },
        meterIssuedTotal: { type: Number, default: 0, min: 0 },
        meterReturnedTotal: { type: Number, default: 0, min: 0 },
        shortageWastageTotal: { type: Number, default: 0, min: 0 },
        finishedMeter: { type: Number, default: 0, min: 0 },
        demoFinishedStockMeter: { type: Number, default: 0, min: 0 },
        remarks: { type: String, trim: true, default: '' },
        dyeingIssues: { type: [dyeingIssueSchema], default: [] },
        dyeingReturns: { type: [dyeingReturnSchema], default: [] },
        stageLabourCosts: { type: [stageLabourCostSchema], default: [] },
        processCostTotal: { type: Number, default: 0, min: 0 },
        stageWip: { type: [stageWipSchema], default: [] },
    },
    { _id: false },
);

const lotStageSchema = new mongoose.Schema(
    {
        stageKey: { type: String, trim: true, default: '' },
        stageName: { type: String, required: true, trim: true },
        sequenceNo: { type: Number, required: true, min: 1 },
        stageType: { type: String, trim: true, default: 'general' },
        allowStart: { type: Boolean, default: true },
        allowComplete: { type: Boolean, default: true },
        allowSkip: { type: Boolean, default: false },
        remarksRequired: { type: Boolean, default: false },
        attachmentRequired: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ['pending', 'started', 'completed', 'skipped'],
            default: 'pending',
        },
        qtyStarted: { type: Number, default: 0, min: 0 },
        qtyCompleted: { type: Number, default: 0, min: 0 },
        pendingQty: { type: Number, default: 0, min: 0 },
        startedAt: { type: Date, default: null },
        startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        completedAt: { type: Date, default: null },
        completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        remarks: { type: String, trim: true, default: '' },
        attachmentUrl: { type: String, trim: true, default: '' },
        attachmentName: { type: String, trim: true, default: '' },
    },
    { _id: true },
);

const workflowProductionLotSchema = new mongoose.Schema(
    {
        lotNo: { type: String, required: true, trim: true, uppercase: true, unique: true },
        batchNo: { type: String, trim: true, default: '' },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', default: null },
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        itemCode: { type: String, trim: true, default: '' },
        itemName: { type: String, trim: true, default: '' },
        qtyStarted: { type: Number, required: true, min: 0.0001 },
        qtyCompleted: { type: Number, default: 0, min: 0 },
        pendingQty: { type: Number, default: 0, min: 0 },
        assignedWorkflowRef: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowMaster', default: null },
        workflowVersion: { type: String, trim: true, default: '' },
        workflowName: { type: String, trim: true, default: '' },
        workflowCode: { type: String, trim: true, default: '' },
        currentStageIndex: { type: Number, default: 0, min: 0 },
        lotStatus: {
            type: String,
            enum: ['draft', 'in_progress', 'completed', 'cancelled'],
            default: 'draft',
        },
        productionModule: {
            type: String,
            enum: ['generic', 'textile'],
            default: 'generic',
        },
        textile: { type: textileDetailsSchema, default: null },
        stages: { type: [lotStageSchema], default: [] },
        auditLog: { type: [auditLogSchema], default: [] },
        isDeleted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

workflowProductionLotSchema.index({ companyId: 1, lotStatus: 1, isDeleted: 1 });
workflowProductionLotSchema.index({ companyId: 1, productionModule: 1, isDeleted: 1 });
workflowProductionLotSchema.index({ lotNo: 1 });
workflowProductionLotSchema.index({ createdAt: -1 });

const WorkflowProductionLot = mongoose.model('WorkflowProductionLot', workflowProductionLotSchema);
export { WorkflowProductionLot };
