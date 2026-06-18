import mongoose from 'mongoose';

const pettyCashSettingsSchema = new mongoose.Schema(
    {
        financialYear: { type: String, required: true, trim: true },
        openingBalance: { type: Number, default: 0 },
        pettyCashLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
        pettyCashCashBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount', default: null },
        replenishmentCashBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount', default: null },
        isActive: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

pettyCashSettingsSchema.index({ financialYear: 1 }, { unique: true });

const PettyCashSettings = mongoose.model('PettyCashSettings', pettyCashSettingsSchema);
export { PettyCashSettings };
export default PettyCashSettings;
