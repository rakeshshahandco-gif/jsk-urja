import mongoose from 'mongoose';

const changedFieldSchema = new mongoose.Schema({
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed, default: null },
    to: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

/**
 * Stored in existing auditlogs collection (jskurja-dev is over the Atlas collection cap).
 * Documents are tagged forensicKind=SALES_DOCUMENT so they can be queried without
 * mixing into normal AuditLog CREATE/UPDATE rows.
 */
const salesDocumentAuditSchema = new mongoose.Schema({
    forensicKind: { type: String, default: 'SALES_DOCUMENT', index: true },
    module: { type: String, default: 'SalesDocumentForensic' },
    action: { type: String, required: true, index: true },
    reason: { type: String, default: '' },
    actorType: { type: String, enum: ['USER', 'SYSTEM'], required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    actorUsername: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    occurredAt: { type: Date, default: Date.now, index: true },
    requestId: { type: String, default: '', index: true },
    httpMethod: { type: String, default: '' },
    apiRoute: { type: String, default: '' },
    sourceModule: { type: String, default: '' },
    creationSource: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    financialYear: { type: String, default: '' },
    financialYearId: { type: String, default: '' },
    sessionRef: { type: String, default: '' },
    salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null, index: true },
    invoiceNumber: { type: String, default: '', index: true },
    salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null, index: true },
    salesOrderNumber: { type: String, default: '', index: true },
    relatedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },
    relatedInvoiceNumber: { type: String, default: '' },
    idempotencyKey: { type: String, default: '' },
    changedFields: { type: [changedFieldSchema], default: [] },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    description: { type: String, default: '' },
}, {
    timestamps: { createdAt: true, updatedAt: false },
    disableTenant: true,
    versionKey: false,
    collection: 'auditlogs',
    autoCreate: false,
    autoIndex: false,
});

function rejectMutation() {
    throw new Error('SalesDocumentAudit is append-only');
}

salesDocumentAuditSchema.pre('updateOne', rejectMutation);
salesDocumentAuditSchema.pre('updateMany', rejectMutation);
salesDocumentAuditSchema.pre('findOneAndUpdate', rejectMutation);
salesDocumentAuditSchema.pre('findOneAndDelete', rejectMutation);
salesDocumentAuditSchema.pre('deleteOne', rejectMutation);
salesDocumentAuditSchema.pre('deleteMany', rejectMutation);
salesDocumentAuditSchema.pre('save', function rejectSaveIfNotNew() {
    if (!this.isNew) rejectMutation();
});

const SalesDocumentAudit = mongoose.model('SalesDocumentAudit', salesDocumentAuditSchema);
export { SalesDocumentAudit };
