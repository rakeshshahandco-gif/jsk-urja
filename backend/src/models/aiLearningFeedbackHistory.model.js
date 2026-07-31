import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    feedbackId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningFeedback', required: true, index: true },
    action: { type: String, trim: true, required: true },
    previousStatus: { type: String, trim: true, default: '' },
    newStatus: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_learning_feedback_history' });

schema.index({ companyId: 1, feedbackId: 1, createdAt: 1 });

const AiLearningFeedbackHistory = mongoose.models.AiLearningFeedbackHistory
    || mongoose.model('AiLearningFeedbackHistory', schema);
export { AiLearningFeedbackHistory };
export default AiLearningFeedbackHistory;
