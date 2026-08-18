import mongoose from 'mongoose';

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        name: { type: String, trim: true, required: true, maxlength: 200 },
        keyword: { type: String, trim: true, required: true, maxlength: 200 },
        location: { type: String, trim: true, default: '' },
        selectedSources: { type: [String], default: [] },
        batchSize: { type: Number, default: 25, min: 1, max: 250 },
        crawlDepth: { type: Number, default: 1 },
        includeDirectories: { type: Boolean, default: true },
        qualificationThreshold: { type: String, trim: true, default: '' },
        active: { type: Boolean, default: true },
        schedule: {
            enabled: { type: Boolean, default: false },
            frequency: { type: String, enum: ['off', 'daily', 'weekly', 'monthly'], default: 'off' },
            weekday: { type: Number, default: 1, min: 0, max: 6 },
            hour: { type: Number, default: 9, min: 0, max: 23 },
            minute: { type: Number, default: 0, min: 0, max: 59 },
            timezone: { type: String, default: 'Asia/Kolkata' },
            nextRunAt: { type: Date, default: null },
            lastRunAt: { type: Date, default: null },
            lastJobId: { type: String, default: '' },
            lastStatus: { type: String, default: '' },
        },
        lastRunId: { type: String, default: '' },
        lastIncremental: { type: mongoose.Schema.Types.Mixed, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'extractor_saved_searches' },
);

schema.index({ companyId: 1, active: 1, updatedAt: -1 });
schema.index({ companyId: 1, 'schedule.enabled': 1, 'schedule.nextRunAt': 1 });

const ExtractorSavedSearch = mongoose.models.ExtractorSavedSearch
    || mongoose.model('ExtractorSavedSearch', schema);
export { ExtractorSavedSearch };
export default ExtractorSavedSearch;
