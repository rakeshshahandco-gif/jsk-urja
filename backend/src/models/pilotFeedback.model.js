import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    source: { type: String, default: 'PILOT_USER' },
    cohortId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotCohort', default: null },
    industry: { type: String, default: '' },
    module: { type: String, default: '' },
    feature: { type: String, default: '' },
    category: { type: String, default: 'Usability', index: true },
    rating: { type: Number, min: 1, max: 5, default: 3 },
    comment: { type: String, trim: true, default: '' },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    priority: { type: String, default: 'MEDIUM' },
    sentiment: { type: String, default: 'NEUTRAL' },
    actionRequired: { type: Boolean, default: false },
    assignedOwnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, default: 'OPEN', index: true },
    resolution: { type: String, default: '' },
    linkedDefectId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotDefect', default: null },
    linkedTestCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'UatTestCase', default: null },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_feedback' });

schema.index({ pilotProgramId: 1, createdAt: -1 });

const PilotFeedback = mongoose.models.PilotFeedback || mongoose.model('PilotFeedback', schema);
export { PilotFeedback };
export default PilotFeedback;
