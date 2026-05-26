import mongoose from 'mongoose';

const bankStatementImportSchema = new mongoose.Schema(
    {
        cashBankAccountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CashBankAccount',
            required: true,
            index: true,
        },
        financialYear: { type: String, trim: true, index: true },
        fileName: { type: String, default: '' },
        fileHash: { type: String, default: '', index: true },
        fileType: { type: String, enum: ['csv', 'xlsx', 'xls', 'txt', 'pdf'], default: 'csv' },
        duplicateFileWarning: { type: Boolean, default: false },
        importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rowCount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['Processing', 'Completed', 'Failed'],
            default: 'Completed',
        },
        errorMessage: { type: String, default: '' },
        dateFrom: { type: Date, default: null },
        dateTo: { type: Date, default: null },
    },
    { timestamps: true },
);

bankStatementImportSchema.index({ cashBankAccountId: 1, createdAt: -1 });
bankStatementImportSchema.index({ cashBankAccountId: 1, fileHash: 1 });

const BankStatementImport = mongoose.model('BankStatementImport', bankStatementImportSchema);
export { BankStatementImport };
