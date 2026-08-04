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
        /**
         * Phase 2 — per-module ON / LOCKED / OFF (additive).
         * When absent for a key, resolveEffectiveModules / enabledModules fallback applies.
         */
        moduleStates: {
            type: [{
                moduleKey: { type: String, trim: true, lowercase: true, required: true },
                state: {
                    type: String,
                    enum: ['ON', 'LOCKED', 'OFF'],
                    required: true,
                },
                lockMode: {
                    type: String,
                    enum: ['READ_ONLY', 'NEW_ENTRY_BLOCKED', 'FULL_LOCK'],
                    default: undefined,
                },
                lockReason: { type: String, trim: true, default: '' },
                remarks: { type: String, trim: true, default: '' },
                changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                changedAt: { type: Date, default: null },
            }],
            default: [],
        },
        /** Append-only history of module state changes (capped in controller). */
        moduleStateAudit: {
            type: [{
                moduleKey: { type: String, trim: true, lowercase: true },
                previousState: { type: String, trim: true, default: '' },
                newState: { type: String, trim: true, default: '' },
                previousLockMode: { type: String, trim: true, default: '' },
                newLockMode: { type: String, trim: true, default: '' },
                lockReason: { type: String, trim: true, default: '' },
                remarks: { type: String, trim: true, default: '' },
                changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                changedByName: { type: String, trim: true, default: '' },
                changedAt: { type: Date, default: Date.now },
            }],
            default: [],
        },
        /** When false (default), legacy full access — JSK URJA unchanged. */
        moduleGuardEnabled: { type: Boolean, default: false },
        /** Set true when admin explicitly configures modules for this company. */
        moduleAllocationConfigured: { type: Boolean, default: false },
        /**
         * Super-Admin company setup lock — when true, industry template, module allocation,
         * workflow assignment, login branding, and deployment mapping cannot be changed
         * until unlocked by a platform admin.
         */
        configurationLocked: { type: Boolean, default: false },
        configurationLockedAt: { type: Date, default: null },
        configurationLockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        configurationLockReason: { type: String, trim: true, default: '' },
        configurationLockHistory: {
            type: [{
                action: { type: String, enum: ['lock', 'unlock'], required: true },
                at: { type: Date, default: Date.now },
                by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                byName: { type: String, trim: true, default: '' },
                reason: { type: String, trim: true, default: '' },
            }],
            default: [],
        },
        clientCode: { type: String, trim: true, default: '' },
        /** URL slug for branded login: /login/{loginSlug} */
        loginSlug: { type: String, trim: true, lowercase: true, default: '' },
        loginTagline: { type: String, trim: true, default: '' },
        loginPrimaryColor: { type: String, trim: true, default: '' },
        /** Application shell subtitle (sidebar/login) — presentation only */
        applicationSubtitle: { type: String, trim: true, default: '' },
        /** Browser tab title override (before | JSK E-SARTHI) */
        browserTitle: { type: String, trim: true, default: '' },
        /** Public favicon URL for this company */
        faviconUrl: { type: String, trim: true, default: '' },
        /** Show Powered by JSK E-SARTHI footer */
        showPlatformFooter: { type: Boolean, default: true },
        deploymentConfig: {
            databaseName: { type: String, trim: true, default: '' },
            backendUrl: { type: String, trim: true, default: '' },
            frontendUrl: { type: String, trim: true, default: '' },
            renderFrontendService: { type: String, trim: true, default: '' },
            renderBackendService: { type: String, trim: true, default: '' },
            lastLiveCommit: { type: String, trim: true, default: '' },
            lastDeployDate: { type: String, trim: true, default: '' },
            deployNotes: { type: String, trim: true, default: '' },
            deploymentStatus: {
                type: String,
                enum: ['', 'local', 'staging', 'live', 'pending'],
                default: '',
            },
        },
        /** Manual deploy history log — Deployment Manager only; does not trigger deploys */
        deploymentHistory: {
            type: [{
                recordedAt: { type: Date, default: Date.now },
                commitHash: { type: String, trim: true, default: '' },
                deployDate: { type: String, trim: true, default: '' },
                changeScope: { type: String, trim: true, default: '' },
                targetServices: { type: String, trim: true, default: '' },
                notes: { type: String, trim: true, default: '' },
                recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                recordedByName: { type: String, trim: true, default: '' },
                /** Phase 4 — CRM-triggered deploy log (manual or Render hook) */
                source: { type: String, trim: true, default: 'manual' },
                clientKey: { type: String, trim: true, default: '' },
                companyName: { type: String, trim: true, default: '' },
                industryTemplateCode: { type: String, trim: true, default: '' },
                serviceTarget: { type: String, trim: true, default: '' },
                environment: { type: String, trim: true, default: '' },
                deployStatus: {
                    type: String,
                    enum: ['', 'pending', 'deploying', 'success', 'failed', 'dry_run', 'blocked'],
                    default: '',
                },
                deployMode: { type: String, trim: true, default: '' },
                deployResponse: { type: mongoose.Schema.Types.Mixed, default: null },
                checklistResult: { type: mongoose.Schema.Types.Mixed, default: null },
                sharedRiskAcknowledged: { type: Boolean, default: false },
                rollbackAvailable: { type: Boolean, default: false },
            }],
            default: [],
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

        // Credit Note income-ledger mapping (system codes; avoids separate Atlas collection)
        creditNoteLedgerConfig: {
            mode: {
                type: String,
                enum: ['default_system', 'select_existing', 'create_new'],
                default: 'default_system',
            },
            defaultSystemCode: { type: String, trim: true, uppercase: true, default: 'SALES_RETURN' },
            mappedLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
            reasonMappings: {
                type: [{
                    reasonKey: { type: String, trim: true, required: true },
                    systemCode: { type: String, trim: true, uppercase: true, required: true },
                    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
                }],
                default: undefined,
            },
            updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            updatedAt: { type: Date, default: null },
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
companySchema.index({ loginSlug: 1 }, { sparse: true });

const Company = mongoose.model('Company', companySchema);
export { Company };
