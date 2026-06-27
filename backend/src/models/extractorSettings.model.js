import mongoose from 'mongoose';

const extractorSettingsSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            unique: true,
            index: true,
        },
        moduleEnabled: { type: Boolean, default: false },
        maxUrlsPerJob: { type: Number, default: 50 },
        maxJobsPerDay: { type: Number, default: 10 },
        maxResultsPerSearch: { type: Number, default: 20 },
        maxRecordsPerExport: { type: Number, default: 5000 },
        searchTimeoutMs: { type: Number, default: 15000 },
        enableSearchLogs: { type: Boolean, default: false },
        allowedAdapters: {
            type: [String],
            default: ['manual_url', 'excel_import', 'web_search'],
        },
        sourceConnectors: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        aiEnabled: { type: Boolean, default: false },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

const ExtractorSettings = mongoose.model('ExtractorSettings', extractorSettingsSchema);
export { ExtractorSettings };
export default ExtractorSettings;
