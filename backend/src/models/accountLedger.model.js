import mongoose from 'mongoose';

const accountLedgerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    printName: { type: String, trim: true },
    alias: { type: String, trim: true },

    // Tally-Style Group Tracking
    underGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AccountGroup',
        default: null
    },
    groupName: { type: String }, // Denormalized for quick reports

    // Entry Types (Compatibility/Tracking)
    type: {
        type: String,
        enum: ['Customer', 'Supplier', 'Cash', 'Bank', 'Expense', 'Income', 'Tax', 'Fixed Asset', 'General'],
        default: 'General'
    },

    // New 2026: Expense Classification
    expenseCategory: {
        type: String,
        enum: ['Fixed', 'Variable', null],
        default: null
    },

    // Reference to existing entities (if any)
    referenceId: { type: mongoose.Schema.Types.ObjectId, refPath: 'referenceModel', default: null },
    referenceModel: { type: String, enum: ['Customer', 'Supplier', 'CashBankAccount', null], default: null },

    openingBalance: { type: Number, default: 0 },
    drCr: { type: String, enum: ['Dr', 'Cr'], default: 'Dr' },
    currentBalance: { type: Number, default: 0 },

    // Behavioural Flags
    isBillWise: { type: Boolean, default: false },
    creditPeriod: { type: Number, default: 0 }, // in days
    gstApplicable: { type: Boolean, default: false },
    gstRate: { type: Number, default: 0 },
    hsnCode: { type: String, trim: true },

    /**
     * Phase 2A — transaction-nature ledger tax settings (additive).
     * Defaults do NOT auto-enable RCM on existing ledgers.
     */
    gstTreatmentDefault: {
        type: String,
        enum: [
            'TRANSACTION_WISE',
            'FORWARD_CHARGE',
            'RCM_CANDIDATE',
            'EXEMPT',
            'NIL_RATED',
            'NON_GST',
            '',
        ],
        default: 'TRANSACTION_WISE',
    },
    rcmCandidate: { type: Boolean, default: false },
    defaultRcmCategory: { type: String, trim: true, default: '' },
    supplyType: {
        type: String,
        enum: ['GOODS', 'SERVICES', 'BOTH', ''],
        default: '',
    },
    defaultHsnSac: { type: String, trim: true, default: '' },
    defaultGstRateId: { type: mongoose.Schema.Types.ObjectId, default: null },
    defaultItcEligibility: {
        type: String,
        enum: ['Eligible', 'Ineligible', 'Blocked', 'Review Required', ''],
        default: '',
    },
    allowTransactionTaxOverride: { type: Boolean, default: true },

    // Tax Details
    gstin: { type: String, trim: true },
    pan: { type: String, trim: true },
    registrationType: { type: String, enum: ['Regular', 'Composition', 'Unregistered', 'Consumer'], default: 'Regular' },

    // Contact Details
    contactPerson: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },

    // Banking Details
    bankName: { type: String, trim: true },
    accountNo: { type: String, trim: true },
    ifsc: { type: String, trim: true },
    upiId: { type: String, trim: true },

    // System Flags
    isCustomer: { type: Boolean, default: false },
    isSupplier: { type: Boolean, default: false },
    isEmployee: { type: Boolean, default: false },
    isBank: { type: Boolean, default: false },
    isCashLedger: { type: Boolean, default: false },
    isTaxLedger: { type: Boolean, default: false },
    isFixedAsset: { type: Boolean, default: false },

    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /** TDS applicability (vendor / expense ledgers) — used by payment TDS engine */
    tdsApplicable: { type: Boolean, default: false },
    tdsSection: { type: String, trim: true, default: '' },
    /**
     * Default TDS payment nature for this expense ledger (suggestion on voucher lines).
     * Examples: Contractor, Professional Services, Technical Services, Rent.
     */
    tdsNature: { type: String, trim: true, default: '' },
    /** auto = rate from TDS Master by supplier constitution; manual = use tdsDefaultRate */
    tdsRateSource: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    /** Manual rate % — used only when tdsRateSource is manual */
    tdsDefaultRate: { type: Number, default: 0, min: 0, max: 100 },
    /**
     * Custom aggregate FY threshold only (single-bill limits always from TDS Master).
     * 0 = use section default aggregate threshold.
     */
    tdsThresholdOverride: { type: Number, default: 0, min: 0 },
    tdsPanMandatory: { type: Boolean, default: false },
    /** When false, 206AA higher rate applies (max of specified rate and panMissingRate). */
    tdsPanAssumedAvailable: { type: Boolean, default: true },
    /** taxable = TDS base excludes GST on purchase payments; with_gst = payment amount as base */
    tdsDeductOn: { type: String, enum: ['taxable', 'with_gst'], default: 'with_gst' },
    /** Optional override of Supplier Master deductee constitution (empty = use supplier) */
    tdsDeducteeConstitution: { type: String, trim: true, default: '' },
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
    tdsPanStatus: {
        type: String,
        enum: ['', 'Valid', 'Invalid', 'NotAvailable'],
        default: '',
    },
    tdsStartDate: { type: Date, default: null },
    msmeApplicable: { type: Boolean, default: false },
    msmeRegNo: { type: String, trim: true, default: '' },
    msmeCategory: { type: String, enum: ['', 'Micro', 'Small', 'Medium'], default: '' },
    tdsExemptionApplicable: { type: Boolean, default: false },
    tdsIgnoreThreshold: { type: Boolean, default: false },

    /** Section-wise TDS liability ledger (under Duties & Taxes → TDS Payable) — one per section recommended. */
    isTdsPayableLedger: { type: Boolean, default: false },
    tdsPayableSectionCode: { type: String, trim: true, uppercase: true, default: '' },
}, { timestamps: true });

accountLedgerSchema.index({ companyId: 1, name: 1 }, { unique: true });
accountLedgerSchema.index({ underGroup: 1 });
accountLedgerSchema.index({ type: 1 });
accountLedgerSchema.index(
    { tdsPayableSectionCode: 1 },
    {
        unique: true,
        partialFilterExpression: {
            isTdsPayableLedger: true,
            tdsPayableSectionCode: { $exists: true, $nin: [null, ''] },
        },
    },
);

const AccountLedger = mongoose.model('AccountLedger', accountLedgerSchema);
export { AccountLedger };
