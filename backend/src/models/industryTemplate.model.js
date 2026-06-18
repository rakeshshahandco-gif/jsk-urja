import mongoose from 'mongoose';

const templateSettingsSchema = new mongoose.Schema(
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

const industryTemplateSchema = new mongoose.Schema(
    {
        templateName: {
            type: String,
            required: [true, 'Template name is required'],
            trim: true,
        },
        templateCode: {
            type: String,
            required: [true, 'Template code is required'],
            trim: true,
            uppercase: true,
            unique: true,
        },
        description: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        isDefaultTemplate: { type: Boolean, default: false },
        templateSettings: { type: templateSettingsSchema, default: () => ({}) },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

industryTemplateSchema.index({ isActive: 1 });
industryTemplateSchema.index({ isDefaultTemplate: 1 });

const IndustryTemplate = mongoose.model('IndustryTemplate', industryTemplateSchema);
export { IndustryTemplate };
