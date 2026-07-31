import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    exceptionType: { type: String, required: true },
    reason: { type: String, trim: true, required: true },
    scope: { type: String, trim: true, default: '' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiry: { type: Date, required: true },
    compensatingControl: { type: String, trim: true, default: '' },
    riskLevel: { type: String, default: 'MEDIUM' },
    reviewDate: { type: Date, default: null },
    status: { type: String, default: 'OPEN', index: true },
    bypassesCriticalIsolation: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_exceptions' });

const PilotException = mongoose.models.PilotException || mongoose.model('PilotException', schema);
export { PilotException };
export default PilotException;
