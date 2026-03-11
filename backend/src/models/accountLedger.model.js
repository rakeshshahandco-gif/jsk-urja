import mongoose from 'mongoose';

const accountLedgerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },

    // Accounting Groups
    group: {
        type: String,
        enum: [
            'Current Assets', 'Fixed Assets', 'Investments',
            'Current Liabilities', 'Loans (Liability)', 'Capital Account',
            'Direct Incomes', 'Indirect Incomes',
            'Direct Expenses', 'Indirect Expenses',
            'Purchase Accounts', 'Sales Accounts',
            'Suspense Account'
        ],
        required: true
    },

    // Type for internal logic
    type: {
        type: String,
        enum: ['Customer', 'Supplier', 'Cash', 'Bank', 'Expense', 'Income', 'Tax', 'General'],
        default: 'General'
    },

    // Reference to existing entities
    referenceId: { type: mongoose.Schema.Types.ObjectId, refPath: 'referenceModel', default: null },
    referenceModel: { type: String, enum: ['Customer', 'Supplier', 'CashBankAccount', null], default: null },

    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },

    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    remarks: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const AccountLedger = mongoose.model('AccountLedger', accountLedgerSchema);
export { AccountLedger };
