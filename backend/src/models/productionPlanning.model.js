import mongoose from 'mongoose';

// Per-product breakdown for a single raw material item
const productBreakdownSchema = new mongoose.Schema({
    finishedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    finishedProductCode: String,
    finishedProductName: String,
    bomQtyPerUnit: { type: Number, default: 0 },
    requiredQty: { type: Number, default: 0 }
}, { _id: false });

// Combined material requirement line (one row per raw material)
const planningLineSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    itemCode: String,
    itemName: String,
    itemGroup: String,
    uom: String,
    usedInProducts: [String],                // list of product codes that need this item
    productWiseBreakdown: [productBreakdownSchema],
    totalRequiredQty: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    reservedQty: { type: Number, default: 0 },
    freeAvailableQty: { type: Number, default: 0 },
    shortageQty: { type: Number, default: 0 },
    suggestedOrderQty: { type: Number, default: 0 },
    maxProducibleQty: { type: Number, default: 0 },
    lastPurchaseRate: { type: Number, default: 0 },
    estimatedPurchaseValue: { type: Number, default: 0 },
    remarks: { type: String, trim: true, default: '' }
});

// One line per finished product selected in the plan
const productLineSchema = new mongoose.Schema({
    finishedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    finishedProductCode: String,
    finishedProductName: String,
    bomId: { type: mongoose.Schema.Types.ObjectId, ref: 'BOM' },
    bomVersion: String,
    plannedQty: { type: Number, required: true, default: 1 },
    requiredDate: Date,
    remarks: { type: String, trim: true, default: '' }
}, { _id: true });

const productionPlanningSchema = new mongoose.Schema({
    planningNo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    planningDate: { type: Date, required: true, default: Date.now },

    // ── Multi-product lines (new) ────────────────────────────────────────────
    productLines: [productLineSchema],

    // ── Legacy single-product fields (kept for API backward compatibility) ───
    finishedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    finishedProductCode: String,
    finishedProductName: String,
    bomId: { type: mongoose.Schema.Types.ObjectId, ref: 'BOM' },
    bomVersion: String,
    plannedQty: { type: Number, default: 1 },

    // ── Common header ────────────────────────────────────────────────────────
    warehouse: { type: String, trim: true, default: 'Main Store' },
    requiredDate: Date,
    status: {
        type: String,
        enum: ['Draft', 'Calculated', 'Approved', 'Purchase Pending', 'Material Arranged', 'Ready for Production', 'Closed', 'Cancelled'],
        default: 'Draft'
    },
    remarks: { type: String, trim: true },

    // ── Summary cards data ───────────────────────────────────────────────────
    summary: {
        totalSelectedProducts: { type: Number, default: 0 },
        totalItems: { type: Number, default: 0 },
        shortageItems: { type: Number, default: 0 },
        fullyAvailableItems: { type: Number, default: 0 },
        maxProductionPossible: { type: Number, default: 0 },
        estimatedShortageValue: { type: Number, default: 0 },
        readinessPercent: { type: Number, default: 0 }
    },

    // ── Combined material requirement lines ──────────────────────────────────
    lines: [planningLineSchema],

    financialYear: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

productionPlanningSchema.index({ planningNo: 1 });
productionPlanningSchema.index({ status: 1 });
productionPlanningSchema.index({ financialYear: 1 });
productionPlanningSchema.index({ 'productLines.finishedProductId': 1 });

const ProductionPlanning = mongoose.model('ProductionPlanning', productionPlanningSchema);
export { ProductionPlanning };
