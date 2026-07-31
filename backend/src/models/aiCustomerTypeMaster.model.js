import mongoose from 'mongoose';

const auditEntrySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        action: { type: String, trim: true, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, trim: true, default: '' },
        snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { _id: false },
);

const aiCustomerTypeMasterSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        name: { type: String, trim: true, required: true },
        keywords: { type: [String], default: [] },
        negativeKeywords: { type: [String], default: [] },
        isActive: { type: Boolean, default: true, index: true },
        version: { type: Number, default: 1 },
        notes: { type: String, trim: true, default: '' },
        auditLog: { type: [auditEntrySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

aiCustomerTypeMasterSchema.index({ companyId: 1, name: 1 }, { unique: true });

const AiCustomerTypeMaster = mongoose.models.AiCustomerTypeMaster
    || mongoose.model('AiCustomerTypeMaster', aiCustomerTypeMasterSchema);

export { AiCustomerTypeMaster };
export default AiCustomerTypeMaster;
