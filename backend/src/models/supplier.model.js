import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
    supplierCode: { type: String, trim: true, uppercase: true },
    supplierName: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    whatsApp: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    area: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    gstNumber: { type: String, trim: true, uppercase: true, default: '' },
    /**
     * Party GST registration status (not on expense/income ledgers).
     * GSTIN required only when status indicates registered.
     */
    gstRegistrationStatus: {
        type: String,
        enum: ['', 'Registered Regular', 'Composition', 'Unregistered', 'SEZ', 'Overseas', 'Exempt Entity'],
        default: '',
    },
    /** Date-effective GST registration (no separate Supplier GST collection) */
    gstRegistrationEffectiveDate: { type: Date, default: null },
    gstCancellationEffectiveDate: { type: Date, default: null },
    /**
     * Bounded embedded GST registration history (max ~20).
     * Also mirrored into GstStatusHistory with entityType=Supplier when altered.
     */
    gstRegistrationHistory: [
        {
            gstin: { type: String, default: '' },
            registrationStatus: { type: String, default: '' },
            status: { type: String, default: '' },
            effectiveFrom: { type: Date, default: null },
            effectiveTo: { type: Date, default: null },
            cancellationEffectiveDate: { type: Date, default: null },
            changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            changedAt: { type: Date, default: Date.now },
            reason: { type: String, default: '' },
        },
    ],
    /**
     * How this supplier typically charges GST on invoices.
     * Does not auto-create RCM — voucher/RCM engine decides transaction-wise.
     */
    supplierChargesGst: {
        type: String,
        enum: ['', 'Forward Charge', 'Reverse Charge', 'Transaction-wise', 'Not Applicable'],
        default: '',
    },
    defaultPlaceOfSupply: { type: String, trim: true, default: '' },

    gstType: { type: String, enum: ['CGST / SGST', 'IGST', ''], default: '' },
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    paymentTerms: { type: String, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    bankAccountNo: { type: String, trim: true, default: '' },
    bankIfsc: { type: String, trim: true, uppercase: true, default: '' },
    isActive: { type: Boolean, default: true },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDrCr: { type: String, enum: ['Dr', 'Cr'], default: 'Cr' },
    remarks: { type: String, trim: true, default: '' },
    // 🛡️ Soft-delete fields — supplier data is NEVER hard-deleted
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
    /** TDS — mirrored on linked ledger; used when ledger not yet linked */
    tdsApplicable: { type: Boolean, default: false },
    tdsSection: { type: String, trim: true, default: '' },
    panVerificationStatus: { type: String, enum: ['', 'Verified', 'Pending', 'Invalid'], default: '' },
    /** Income-tax deductee constitution — drives auto rate (Individual/HUF vs Others) from TDS Master */
    deducteeConstitution: { type: String, trim: true, default: '' },
    tdsDeductorType: { type: String, enum: ['', 'Individual', 'HUF', 'Others'], default: 'Others' },
    tdsLowerDeductionPercent: { type: Number, default: 0, min: 0, max: 100 },
    tdsLowerDeductionValidFrom: { type: Date, default: null },
    tdsLowerDeductionValidTo: { type: Date, default: null },
    tdsLowerDeductionCertificates: [
        {
            section: { type: String, trim: true, uppercase: true, default: '' },
            certificateNo: { type: String, trim: true, default: '' },
            rate: { type: Number, min: 0, max: 100, default: 0 },
            validFrom: { type: Date, default: null },
            validTo: { type: Date, default: null },
            active: { type: Boolean, default: true },
        },
    ],
    msmeApplicable: { type: Boolean, default: false },
    msmeRegNo: { type: String, trim: true, default: '' },
    msmeCategory: { type: String, enum: ['', 'Micro', 'Small', 'Medium'], default: '' },
    tdsStartDate: { type: Date, default: null },
    tdsExemptionApplicable: { type: Boolean, default: false },
    tdsThresholdOverride: { type: Number, default: 0, min: 0 },
    tdsIgnoreThreshold: { type: Boolean, default: false },
    /** Tenant ownership (also injected by tenantSchemaPlugin when loaded via db.js) */
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        index: true,
        default: null,
    },
}, { timestamps: true });

supplierSchema.index({ supplierName: 'text', supplierCode: 'text' });
supplierSchema.index({ companyId: 1, supplierCode: 1 }, { unique: true, sparse: true });

/**
 * 🛡️  SAFETY HOOK: Block isDeleted from being set via findOneAndUpdate / updateMany
 */
const _stripIsDeletedFromUpdate = function (next) {
    const update = this.getUpdate();
    if (!update) return next();
    if (update.$set && update.$set.isDeleted !== undefined) delete update.$set.isDeleted;
    if (update.isDeleted !== undefined) delete update.isDeleted;
    next();
};
supplierSchema.pre('findOneAndUpdate', _stripIsDeletedFromUpdate);
supplierSchema.pre('updateOne', _stripIsDeletedFromUpdate);
supplierSchema.pre('updateMany', _stripIsDeletedFromUpdate);
supplierSchema.pre('findByIdAndUpdate', _stripIsDeletedFromUpdate);

const Supplier = mongoose.model('Supplier', supplierSchema);
export { Supplier };
