import mongoose from 'mongoose';

const bankDetailSchema = new mongoose.Schema({
    bankName: { type: String, trim: true, default: '' },
    accountNo: { type: String, trim: true, default: '' },
    accountType: { type: String, trim: true, default: '' },
    branchName: { type: String, trim: true, default: '' },
    ifscCode: { type: String, trim: true, default: '' },
    swiftCode: { type: String, trim: true, default: '' },
}, { _id: false });

const companySchema = new mongoose.Schema(
    {
        // Identity
        companyName: { type: String, required: true, trim: true },
        companyType: {
            type: String,
            enum: ['Pvt Ltd', 'Partnership', 'Proprietorship', 'LLP', 'Other'],
            default: 'Pvt Ltd',
        },
        legalName: { type: String, trim: true, default: '' },
        brandName: { type: String, trim: true, default: '' },

        // Address
        address: { type: String, trim: true, default: '' },
        city: { type: String, trim: true, default: '' },
        state: { type: String, trim: true, default: '' },
        pincode: { type: String, trim: true, default: '' },
        country: { type: String, trim: true, default: 'India' },

        // Legal
        gstNumber: { type: String, trim: true, default: '' },
        panNumber: { type: String, trim: true, default: '' },
        cinNumber: { type: String, trim: true, default: '' },   // CIN / Registration No

        // Contact
        contactPerson: { type: String, trim: true, default: '' },
        mobile: { type: String, trim: true, default: '' },
        email: { type: String, trim: true, default: '' },
        website: { type: String, trim: true, default: '' },

        // Banking
        bankDetails: { type: bankDetailSchema, default: () => ({}) },

        // Media / Documents
        logoUrl: { type: String, trim: true, default: '' },
        signatureUrl: { type: String, trim: true, default: '' },  // Signature / Stamp

        // Operations
        termsAndConditions: { type: String, trim: true, default: '' },
        defaultFinancialYear: { type: String, trim: true, default: '' },

        // SaaS — Module Control (which modules this company has access to)
        enabledModules: {
            type: [String],
            default: ['crm', 'accounts', 'inventory', 'gst', 'tds', 'production', 'service', 'hr', 'rd', 'reports', 'payroll'],
        },

        // SaaS — Subscription reference
        subscriptionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },

        // Status
        isActive: { type: Boolean, default: true },
        isDefault: { type: Boolean, default: false },  // True for the primary/existing company

        // Audit
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true }
);

// Index for fast lookup
companySchema.index({ isActive: 1 });
companySchema.index({ isDefault: 1 });

const Company = mongoose.model('Company', companySchema);
export { Company };
