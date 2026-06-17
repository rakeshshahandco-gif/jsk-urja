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
        disabledModules: { type: [String], default: [] },
        /** When false (default), legacy full access — JSK URJA unchanged. */
        moduleGuardEnabled: { type: Boolean, default: false },
        /** Set true when admin explicitly configures modules for this company. */
        moduleAllocationConfigured: { type: Boolean, default: false },
        clientCode: { type: String, trim: true, default: '' },
        deploymentConfig: {
            databaseName: { type: String, trim: true, default: '' },
            backendUrl: { type: String, trim: true, default: '' },
            frontendUrl: { type: String, trim: true, default: '' },
            deploymentStatus: {
                type: String,
                enum: ['', 'local', 'staging', 'live', 'pending'],
                default: '',
            },
        },

        // SaaS — Subscription reference
        subscriptionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },

        // Industry Template (Phase 1 — reference only; null = use default Electronics template at runtime)
        industryTemplateRef: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryTemplate', default: null },

        // Phase 8 — Company Workflow Assignment (configuration only; does not drive production yet)
        assignedWorkflowRef: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowMaster', default: null },
        workflowVersion: { type: String, trim: true, default: '' },
        activeWorkflow: { type: Boolean, default: false },
        workflowAssignedAt: { type: Date, default: null },
        workflowSnapshot: {
            workflowName: { type: String, trim: true, default: '' },
            workflowCode: { type: String, trim: true, default: '' },
            description: { type: String, trim: true, default: '' },
            industryTemplateRef: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryTemplate', default: null },
            stages: { type: [mongoose.Schema.Types.Mixed], default: [] },
            capturedAt: { type: Date, default: null },
        },

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
