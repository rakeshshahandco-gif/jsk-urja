import mongoose from 'mongoose';

const planningLineSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    itemCode: String,
    itemName: String,
    itemGroup: String,
    uom: String,
    bomQtyPerUnit: {
        type: Number,
        required: true,
        default: 0
    },
    totalRequiredQty: {
        type: Number,
        required: true,
        default: 0
    },
    currentStock: {
        type: Number,
        default: 0
    },
    reservedQty: {
        type: Number,
        default: 0
    },
    freeAvailableQty: {
        type: Number,
        default: 0
    },
    shortageQty: {
        type: Number,
        default: 0
    },
    suggestedOrderQty: {
        type: Number,
        default: 0
    },
    maxProducibleQty: {
        type: Number,
        default: 0
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    }
});

const productionPlanningSchema = new mongoose.Schema({
    planningNo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    planningDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    finishedProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    finishedProductCode: String,
    finishedProductName: String,
    bomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BOM',
        required: true
    },
    bomVersion: String,
    plannedQty: {
        type: Number,
        required: true,
        default: 1
    },
    warehouse: {
        type: String,
        trim: true,
        default: 'Main Store'
    },
    requiredDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Draft', 'Calculated', 'Approved', 'Purchase Pending', 'Material Arranged', 'Ready for Production', 'Closed', 'Cancelled'],
        default: 'Draft'
    },
    remarks: {
        type: String,
        trim: true
    },
    
    // Summary Cards data
    summary: {
        totalItems: { type: Number, default: 0 },
        shortageItems: { type: Number, default: 0 },
        fullyAvailableItems: { type: Number, default: 0 },
        maxProductionPossible: { type: Number, default: 0 },
        estimatedPurchaseValue: { type: Number, default: 0 }
    },

    lines: [planningLineSchema],

    financialYear: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

productionPlanningSchema.index({ planningNo: 1 });
productionPlanningSchema.index({ finishedProductId: 1 });
productionPlanningSchema.index({ status: 1 });
productionPlanningSchema.index({ financialYear: 1 });

const ProductionPlanning = mongoose.model('ProductionPlanning', productionPlanningSchema);
export { ProductionPlanning };
