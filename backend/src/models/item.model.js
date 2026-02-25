import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({

    // ── 1. BASIC INFORMATION ──────────────────────────────────────────────────
    itemCode: {
        type: String,
        required: [true, 'Item code is required'],
        unique: true,
        trim: true,
        uppercase: true
    },
    itemName: {
        type: String,
        required: [true, 'Item name is required'],
        trim: true
    },
    itemGroupName: {
        type: String,
        trim: true,
        default: ''
    },
    itemCategory: {
        type: String,
        required: [true, 'Item category is required'],
        enum: ['RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'TRADING', 'CONSUMABLE'],
    },
    itemType: {
        type: String,
        default: 'OTHER'
    },
    points: {
        type: String,
        trim: true,
        default: ''
    },
    uom: {
        type: String,
        enum: ['NOS', 'PCS', 'METER', 'KG', 'BOX', 'SET', 'ROLL', 'LITRE'],
        default: 'NOS'
    },

    // ── 2. STOCK INFORMATION ──────────────────────────────────────────────────
    openingStock: { type: Number, default: 0 },
    minStockLevel: { type: Number, default: 0 },
    maxStockLevel: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    valuationRate: { type: Number, default: 0 },
    warehouseLocation: { type: String, trim: true, default: '' },
    batchTracking: { type: Boolean, default: false },
    serialTracking: { type: Boolean, default: false },

    // ── 3. PURCHASE INFORMATION ───────────────────────────────────────────────
    defaultSupplier: { type: String, trim: true, default: '' },
    purchaseRate: { type: Number, default: 0 },
    purchaseGst: { type: Number, default: 18 },
    hsnCode: { type: String, trim: true, default: '' },
    leadTimeDays: { type: Number, default: 0 },

    // ── 4. SALES INFORMATION ─────────────────────────────────────────────────
    sellingPrice: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    warrantyMonths: { type: Number, default: 0 },
    salesGst: { type: Number, default: 18 },
    productDescription: { type: String, trim: true, default: '' },

    // ── 5. PRODUCTION INFORMATION ─────────────────────────────────────────────
    isManufacturable: { type: Boolean, default: false },
    bomLink: { type: String, trim: true, default: '' },
    productionTimeHours: { type: Number, default: 0 },
    machineRequired: { type: String, trim: true, default: '' },
    qcRequired: { type: Boolean, default: false },
    stdProductionCost: { type: Number, default: 0 },

    // ── 6. TECHNICAL SPECIFICATIONS (Electrical items only) ────────────────────
    technical: {
        wattage: { type: String, trim: true, default: '' },
        inputVoltage: { type: String, trim: true, default: '' },
        outputVoltage: { type: String, trim: true, default: '' },
        outputCurrent: { type: String, trim: true, default: '' },
        dimmingType: {
            type: String,
            enum: ['', 'PHASE_CUT', 'DALI', '0-10V', 'ZIGBEE', 'BLE', 'TRIAC', 'PWM'],
            default: ''
        },
        ipRating: { type: String, trim: true, default: '' },
        surgeProtection: { type: String, trim: true, default: '' },
        efficiency: { type: String, trim: true, default: '' },
    },

    // ── 7. ACCOUNTING LINK ────────────────────────────────────────────────────
    purchaseAccount: { type: String, trim: true, default: '' },
    salesAccount: { type: String, trim: true, default: '' },
    inventoryAccount: { type: String, trim: true, default: '' },
    cogsAccount: { type: String, trim: true, default: '' },

    // ── 8. STATUS & CONTROL ───────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isServiceItem: { type: Boolean, default: false },
    allowNegativeStock: { type: Boolean, default: false },

    // Meta
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }

}, { timestamps: true });

// Index for fast lookups
itemSchema.index({ itemCode: 1 });
itemSchema.index({ itemCategory: 1, isActive: 1 });
itemSchema.index({ itemName: 'text', itemCode: 'text' });

const Item = mongoose.model('Item', itemSchema);
export { Item };
