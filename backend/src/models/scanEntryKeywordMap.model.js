import mongoose from 'mongoose';

const scanEntryKeywordMapSchema = new mongoose.Schema(
    {
        keyword: { type: String, required: true, trim: true, lowercase: true },
        ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
        ledgerName: { type: String, trim: true, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

scanEntryKeywordMapSchema.index({ keyword: 1 }, { unique: true });

const ScanEntryKeywordMap = mongoose.model('ScanEntryKeywordMap', scanEntryKeywordMapSchema);
export { ScanEntryKeywordMap };
export default ScanEntryKeywordMap;

