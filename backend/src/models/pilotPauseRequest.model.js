import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    requestType: { type: String, enum: ['PAUSE', 'SUSPENSION'], default: 'PAUSE' },
    reason: { type: String, trim: true, required: true },
    reasonCategory: { type: String, default: 'CRITICAL_DEFECT' },
    status: { type: String, default: 'REQUESTED', index: true },
    reviewNotes: { type: String, default: '' },
    simulationOnly: { type: Boolean, default: true },
    runtimeActionExecuted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_pause_requests' });

const PilotPauseRequest = mongoose.models.PilotPauseRequest || mongoose.model('PilotPauseRequest', schema);
export { PilotPauseRequest };
export default PilotPauseRequest;
