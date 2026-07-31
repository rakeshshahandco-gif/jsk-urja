import mongoose from 'mongoose';

const auditEntrySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        action: { type: String, trim: true, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const opportunityPrioritySchema = new mongoose.Schema(
    {
        opportunityType: { type: String, trim: true, default: '' },
        priorityRank: { type: Number, default: 50 },
    },
    { _id: false },
);

const aiContactRoleMasterSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        roleName: { type: String, trim: true, required: true },
        roleGroup: { type: String, trim: true, default: 'General' },
        keywords: { type: [String], default: [] },
        negativeKeywords: { type: [String], default: [] },
        seniorityWeight: { type: Number, default: 50, min: 0, max: 100 },
        decisionMakerWeight: { type: Number, default: 50, min: 0, max: 100 },
        applicableIndustries: { type: [String], default: [] },
        applicableOpportunityTypes: { type: [String], default: [] },
        opportunityPriorities: { type: [opportunityPrioritySchema], default: [] },
        isActive: { type: Boolean, default: true, index: true },
        version: { type: Number, default: 1 },
        notes: { type: String, trim: true, default: '' },
        auditLog: { type: [auditEntrySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'ai_contact_role_masters' },
);

aiContactRoleMasterSchema.index({ companyId: 1, roleName: 1 }, { unique: true });

const AiContactRoleMaster = mongoose.models.AiContactRoleMaster
    || mongoose.model('AiContactRoleMaster', aiContactRoleMasterSchema);
export { AiContactRoleMaster };
export default AiContactRoleMaster;
