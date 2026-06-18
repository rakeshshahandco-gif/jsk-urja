import mongoose from 'mongoose';

/**
 * Phase 1 — structure only for future company-level template overrides.
 * Example future use: Exporter template has Grace Period OFF; Kevin Group override ON.
 * No business logic wired in Phase 1.
 */
const overrideSettingsSchema = new mongoose.Schema(
    {
        moduleSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        fieldSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        workflowSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        sopSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        productionProcessSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        documentSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        reportSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        dashboardSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    },
    { _id: false },
);

const companyTemplateOverrideSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        industryTemplateRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'IndustryTemplate',
            required: true,
        },
        overrideSettings: { type: overrideSettingsSchema, default: () => ({}) },
        notes: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

companyTemplateOverrideSchema.index({ companyId: 1, industryTemplateRef: 1 }, { unique: true });

const CompanyTemplateOverride = mongoose.model('CompanyTemplateOverride', companyTemplateOverrideSchema);
export { CompanyTemplateOverride };
