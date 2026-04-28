import mongoose from 'mongoose';

const adjustmentEntrySchema = new mongoose.Schema({
    integratedTax: { type: Number, default: 0 },
    centralTax: { type: Number, default: 0 },
    stateUtTax: { type: Number, default: 0 },
    cess: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
}, { _id: false });

const gstr3bAdjustmentSchema = new mongoose.Schema({
    financialYear: { type: String, required: true }, // e.g. "2025-2026"
    month: { type: String, required: true }, // "01" to "12"
    
    // Table 4 - Eligible ITC (Manual Entries)
    table4: {
        importGoods: { type: adjustmentEntrySchema, default: () => ({}) },
        importServices: { type: adjustmentEntrySchema, default: () => ({}) },
        inwardRcm: { type: adjustmentEntrySchema, default: () => ({}) },
        inwardIsd: { type: adjustmentEntrySchema, default: () => ({}) },
        allOtherItc: { type: adjustmentEntrySchema, default: () => ({}) },
        itcReversedRule38_42_43: { type: adjustmentEntrySchema, default: () => ({}) },
        itcReversedOthers: { type: adjustmentEntrySchema, default: () => ({}) },
        itcReclaimed: { type: adjustmentEntrySchema, default: () => ({}) },
        ineligibleItc16_4: { type: adjustmentEntrySchema, default: () => ({}) },
    },

    // Table 5 - Exempt/Nil/Non-GST Inward
    table5: {
        compositionExemptNil: {
            interState: { type: Number, default: 0 },
            intraState: { type: Number, default: 0 },
        },
        nonGst: {
            interState: { type: Number, default: 0 },
            intraState: { type: Number, default: 0 },
        }
    },

    // Table 5.1 - Interest & Late Fee
    table51: {
        interest: { type: adjustmentEntrySchema, default: () => ({}) },
        lateFee: { type: adjustmentEntrySchema, default: () => ({}) },
    },

    // Table 6.1 - Payment of Tax (Paid through Cash)
    table61: {
        cashPaid: { type: adjustmentEntrySchema, default: () => ({}) },
    },

    remarks: { type: String, default: '' },
    
    auditLog: [{
        action: String,
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        oldValues: mongoose.Schema.Types.Mixed,
        newValues: mongoose.Schema.Types.Mixed,
        reason: String
    }],

    status: { type: String, default: 'Draft' }, // Draft, Finalized
}, { timestamps: true });

gstr3bAdjustmentSchema.index({ financialYear: 1, month: 1 }, { unique: true });

const Gstr3bAdjustment = mongoose.model('Gstr3bAdjustment', gstr3bAdjustmentSchema);
export { Gstr3bAdjustment };
