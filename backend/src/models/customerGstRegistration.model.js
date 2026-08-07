import mongoose from 'mongoose';

/**
 * Child registrations — multiple GSTINs per customer (state/branch).
 * Cancelling one GSTIN must not cancel others.
 */
const customerGstRegistrationSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
        gstin: { type: String, required: true, uppercase: true, trim: true },
        state: { type: String, default: '' },
        stateCode: { type: String, default: '' },
        branchName: { type: String, default: '' },
        billingAddress: { type: String, default: '' },
        status: { type: String, default: 'Unknown' },
        effectiveFrom: { type: Date, default: null },
        effectiveTo: { type: Date, default: null },
        defaultForState: { type: Boolean, default: false },
        activeForBilling: { type: Boolean, default: true },
        lastVerifiedAt: { type: Date, default: null },
        legalName: { type: String, default: '' },
        tradeName: { type: String, default: '' },
        cancellationDate: { type: Date, default: null },
        registrationDate: { type: Date, default: null },
        notes: { type: String, default: '' },
    },
    // Lazy: do not create empty collection on backend startup (Atlas free-tier limit).
    { timestamps: true, autoCreate: false, autoIndex: false },
);

customerGstRegistrationSchema.index({ companyId: 1, customerId: 1, gstin: 1 }, { unique: true });

export const CustomerGstRegistration = mongoose.model('CustomerGstRegistration', customerGstRegistrationSchema);
