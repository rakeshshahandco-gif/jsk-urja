import mongoose from 'mongoose';

const cashBankAccountSchema = new mongoose.Schema({
    accountName: { type: String, required: true, trim: true, unique: true },
    accountType: { type: String, enum: ['Cash', 'Bank'], required: true },

    // Bank specific fields
    bankName: { type: String, default: '' },
    branchName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },

    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: { type: Date, default: Date.now },
    currentBalance: { type: Number, default: 0 },

    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    remarks: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const CashBankAccount = mongoose.model('CashBankAccount', cashBankAccountSchema);
export { CashBankAccount };
