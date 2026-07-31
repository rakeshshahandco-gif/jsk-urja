import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', required: true, index: true },
    exceptionType: { type: String, required: true },
    reason: { type: String, required: true },
    scope: { type: String, default: '' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiry: { type: Date, required: true, index: true },
    compensatingControl: { type: String, default: '' },
    riskLevel: { type: String, default: 'MEDIUM' },
    reviewDate: { type: Date, default: null },
    status: { type: String, default: 'OPEN', index: true },
    bypassesCriticalIsolation: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_exceptions' });

const OpsException = mongoose.models.OpsException || mongoose.model('OpsException', schema);
export { OpsException };
export default OpsException;