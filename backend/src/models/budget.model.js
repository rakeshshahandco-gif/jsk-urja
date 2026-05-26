import mongoose from 'mongoose';

const budgetLineSchema = new mongoose.Schema({
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
    ledgerName: { type: String, default: '' },
    budgetedAmount: { type: Number, required: true, min: 0 },
    costCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter', default: null },
    costCenterName: { type: String, default: '' },
});

const budgetSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    financialYear: { type: String, required: true, trim: true }, // e.g. "2025-2026"
    type: {
        type: String,
        enum: ['Annual', 'Monthly', 'Quarterly'],
        default: 'Annual',
    },
    // For Monthly / Quarterly: which period this budget covers
    period: { type: String, trim: true, default: '' }, // e.g. "Apr-2025" or "Q1-2025"
    lines: [budgetLineSchema],
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

budgetSchema.index({ financialYear: 1 });
budgetSchema.index({ type: 1 });

const Budget = mongoose.model('Budget', budgetSchema);
export { Budget };
