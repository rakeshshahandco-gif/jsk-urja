import mongoose from 'mongoose';

const accountLedgerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
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
}, { timestamps: true });

accountLedgerSchema.index({ name: 1 });
accountLedgerSchema.index({ underGroup: 1 });
accountLedgerSchema.index({ type: 1 });

const AccountLedger = mongoose.model('AccountLedger', accountLedgerSchema);
export { AccountLedger };
