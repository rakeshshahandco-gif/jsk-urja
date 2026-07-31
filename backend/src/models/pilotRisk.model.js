import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    riskCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    category: { type: String, default: 'Operational', index: true },
    likelihood: { type: Number, min: 1, max: 5, default: 3 },
    impact: { type: Number, min: 1, max: 5, default: 3 },
    inherentScore: { type: Number, default: 9 },
    residualScore: { type: Number, default: 9 },
    mitigation: { type: String, trim: true, default: '' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, default: 'OPEN', index: true },
    reviewDate: { type: Date, default: null },
    acceptedRisk: { type: Boolean, default: false },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptanceExpiry: { type: Date, default: null },
    acceptanceReason: { type: String, default: '' },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    linkedDefectId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotDefect', default: null },
    linkedFindingId: { type: mongoose.Schema.Types.ObjectId, default: null },
    linkedUatTestId: { type: mongoose.Schema.Types.ObjectId, default: null },
    platformLevel: { type: Boolean, default: false },
    criticalUnmitigated: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_risks' });

schema.index({ pilotProgramId: 1, status: 1 });

const PilotRisk = mongoose.models.PilotRisk || mongoose.model('PilotRisk', schema);
export { PilotRisk };
export default PilotRisk;
