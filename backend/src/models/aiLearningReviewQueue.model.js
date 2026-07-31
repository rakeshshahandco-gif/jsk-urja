import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    module: { type: String, trim: true, required: true, index: true },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM', index: true },
    sourceRecordId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    feedbackIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'AiLearningFeedback', default: [] },
    disagreementCount: { type: Number, default: 0 },
    severity: { type: String, trim: true, default: 'MEDIUM' },
    assignedReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED'], default: 'OPEN', index: true },
    conflictGroup: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_learning_review_queue' });

schema.index({ companyId: 1, status: 1, priority: 1, createdAt: -1 });

const AiLearningReviewQueue = mongoose.models.AiLearningReviewQueue
    || mongoose.model('AiLearningReviewQueue', schema);
export { AiLearningReviewQueue };
export default AiLearningReviewQueue;
