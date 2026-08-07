import mongoose from 'mongoose';

const gstStatusHistorySchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        /** Backward-compatible Customer link; prefer entityType + entityId for new writes */
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
        entityType: {
            type: String,
            enum: ['Customer', 'Supplier'],
            default: 'Customer',
            index: true,
        },
        entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
        gstin: { type: String, required: true, uppercase: true, trim: true, index: true },
        status: {
            type: String,
            enum: [
                'Active',
                'Cancelled',
                'Suspended',
                'Inactive',
                'Not Found',
                'Invalid',
                'Unknown',
                'Verification Unavailable',
                'Revoked',
                'Restored',
            ],
            default: 'Unknown',
        },
        registrationType: { type: String, default: '' },
        effectiveFrom: { type: Date, default: null },
        effectiveTo: { type: Date, default: null },
        registrationDate: { type: Date, default: null },
        cancellationDate: { type: Date, default: null },
        suspensionDate: { type: Date, default: null },
        revocationDate: { type: Date, default: null },
        source: { type: String, default: 'provider' },
        providerName: { type: String, default: '' },
        providerReference: { type: String, default: '' },
        verifiedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        supersedesHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstStatusHistory', default: null },
        notes: { type: String, default: '' },
        statusConfidence: { type: String, default: 'medium' },
        manualOverride: { type: Boolean, default: false },
        manualOverrideReason: { type: String, default: '' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
    },
    // Lazy: do not create empty collection on backend startup (Atlas free-tier limit).
    { timestamps: true, autoCreate: false, autoIndex: false },
);

gstStatusHistorySchema.index({ companyId: 1, gstin: 1, effectiveFrom: 1 });

export const GstStatusHistory = mongoose.model('GstStatusHistory', gstStatusHistorySchema);
