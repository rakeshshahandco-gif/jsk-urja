import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    cohortName: { type: String, trim: true, required: true },
    cohortType: { type: String, trim: true, default: 'UAT_TESTERS' },
    industry: { type: String, trim: true, default: '' },
    includedUsers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    excludedUsers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    plannedModuleAccess: { type: [String], default: [] },
    plannedPermissions: { type: [String], default: [] },
    startWindow: { type: Date, default: null },
    endWindow: { type: Date, default: null },
    trainingRequired: { type: Boolean, default: true },
    uatResponsibilities: { type: [String], default: [] },
    feedbackResponsibilities: { type: [String], default: [] },
    riskClassification: { type: String, default: 'MEDIUM' },
    activeSimulationStatus: { type: String, default: 'PLANNED' },
    runtimePermissionsGranted: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_cohorts' });

schema.index({ pilotProgramId: 1, cohortName: 1 });

const PilotCohort = mongoose.models.PilotCohort || mongoose.model('PilotCohort', schema);
export { PilotCohort };
export default PilotCohort;
