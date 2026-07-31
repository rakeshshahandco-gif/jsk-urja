import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    module: { type: String, trim: true, required: true, index: true },
    name: { type: String, trim: true, required: true },
    version: { type: String, trim: true, default: '1' },
    recordCount: { type: Number, default: 0 },
    inclusionCriteria: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    exclusionCriteria: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    feedbackReferences: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    sourceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
    redactionLevel: { type: String, enum: ['STRICT', 'STANDARD', 'MINIMAL'], default: 'STRICT' },
    status: { type: String, enum: ['DRAFT', 'READY', 'EXPORTED', 'ARCHIVED'], default: 'DRAFT', index: true },
    storageReference: { type: String, trim: true, default: '' },
    storageKind: { type: String, enum: ['LOCAL_FILE', 'ATTACHMENT', 'NONE'], default: 'LOCAL_FILE' },
    checksum: { type: String, trim: true, default: '' },
    rowCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_learning_evaluation_datasets' });

schema.index({ companyId: 1, status: 1, createdAt: -1 });

const AiLearningEvaluationDataset = mongoose.models.AiLearningEvaluationDataset
    || mongoose.model('AiLearningEvaluationDataset', schema);
export { AiLearningEvaluationDataset };
export default AiLearningEvaluationDataset;
