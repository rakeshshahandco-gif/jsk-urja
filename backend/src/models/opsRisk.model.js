import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', required: true, index: true },
    riskCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'Operational', index: true },
    likelihood: { type: Number, min: 1, max: 5, default: 3 },
    impact: { type: Number, min: 1, max: 5, default: 3 },
    inherentScore: { type: Number, default: 9 },
    residualScore: { type: Number, default: 9 },
    mitigation: { type: String, default: '' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, default: 'OPEN', index: true },
    acceptedRisk: { type: Boolean, default: false },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptanceExpiry: { type: Date, default: null },
    acceptanceReason: { type: String, default: '' },
    platformLevel: { type: Boolean, default: false },
    criticalUnmitigated: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_risks' });

const OpsRisk = mongoose.models.OpsRisk || mongoose.model('OpsRisk', schema);
export { OpsRisk };
export default OpsRisk;