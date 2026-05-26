import mongoose from 'mongoose';

/**
 * Per-company accounting period locks (books + GST).
 * Admin override uses unlockReason on temporary unlock records.
 */
const accountingPeriodLockSchema = new mongoose.Schema({
    financialYear: { type: String, required: true, trim: true },
    booksLockedTill: { type: Date, default: null },
    gstLockedTill: { type: Date, default: null },
    /** TDS compliance edits (deductions, challans) — falls back to booksLockedTill when null */
    tdsLockedTill: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    unlockReason: { type: String, trim: true, default: '' },
    unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    unlockedTill: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, trim: true, default: '' },
}, { timestamps: true });

accountingPeriodLockSchema.index({ financialYear: 1 }, { unique: true });

const AccountingPeriodLock = mongoose.model('AccountingPeriodLock', accountingPeriodLockSchema);
export { AccountingPeriodLock };
