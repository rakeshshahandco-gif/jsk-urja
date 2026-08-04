import mongoose from 'mongoose';

/** Indexed FY-wise supplier + section running totals for fast threshold checks. */
const tdsVendorSectionBalanceSchema = new mongoose.Schema(
    {
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
        section: { type: String, required: true, trim: true, uppercase: true, index: true },
        /**
         * Disambiguates threshold buckets when one statutory section covers multiple natures
         * (e.g. 194J Professional vs Technical). Empty = legacy single bucket for the section.
         */
        natureKey: { type: String, trim: true, uppercase: true, default: '', index: true },
        financialYear: { type: String, required: true, trim: true, index: true },
        cumulativePaid: { type: Number, default: 0, min: 0 },
        cumulativeTdsDeducted: { type: Number, default: 0, min: 0 },
        transactionCount: { type: Number, default: 0, min: 0 },
        lastPaymentEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentEntry', default: null },
        lastUpdatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

tdsVendorSectionBalanceSchema.index(
    { supplierId: 1, section: 1, natureKey: 1, financialYear: 1, companyId: 1 },
    { unique: true },
);

export const TdsVendorSectionBalance = mongoose.model('TdsVendorSectionBalance', tdsVendorSectionBalanceSchema);
