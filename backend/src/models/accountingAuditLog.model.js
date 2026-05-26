import mongoose from 'mongoose';

/** Append-only accounting audit trail (separate from general AuditLog). */
const accountingAuditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'CANCEL', 'DELETE', 'POST', 'NUMBER_CHANGE'],
    },
    moduleSource: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    voucherNo: { type: String, trim: true, default: '' },
    financialYear: { type: String, trim: true, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, default: '' },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    ipAddress: { type: String, trim: true, default: '' },
}, { timestamps: true });

accountingAuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
accountingAuditLogSchema.index({ financialYear: 1, createdAt: -1 });

const AccountingAuditLog = mongoose.model('AccountingAuditLog', accountingAuditLogSchema);
export { AccountingAuditLog };
