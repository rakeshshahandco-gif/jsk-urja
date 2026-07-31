import mongoose from 'mongoose';

export const FINDING_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
export const FINDING_STATUSES = [
    'OPEN', 'ACKNOWLEDGED', 'REMEDIATION_PLANNED', 'REMEDIATION_IN_PROGRESS',
    'READY_FOR_RETEST', 'RESOLVED', 'ACCEPTED_RISK', 'FALSE_POSITIVE', 'DEFERRED', 'ARCHIVED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    findingCode: { type: String, trim: true, default: '' },
    domain: { type: String, trim: true, default: '', index: true },
    controlCode: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    severity: { type: String, enum: FINDING_SEVERITIES, default: 'MEDIUM', index: true },
    status: { type: String, enum: FINDING_STATUSES, default: 'OPEN', index: true },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    remediation: { type: mongoose.Schema.Types.Mixed, default: null },
    retest: { type: mongoose.Schema.Types.Mixed, default: null },
    acceptedRisk: { type: mongoose.Schema.Types.Mixed, default: null },
    blocksReadiness: { type: Boolean, default: false },
    tenantIsolationRelated: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'production_readiness_findings' });

schema.index({ certificationId: 1, severity: 1, status: 1 });
schema.index({ certificationId: 1, createdAt: -1 });

const ProductionReadinessFinding = mongoose.models.ProductionReadinessFinding
    || mongoose.model('ProductionReadinessFinding', schema);
export { ProductionReadinessFinding };
export default ProductionReadinessFinding;
