import mongoose from 'mongoose';

const tdsMasterSectionSchema = new mongoose.Schema(
    {
        sectionCode: { type: String, required: true, trim: true, uppercase: true },
        sectionName: { type: String, trim: true, default: '' },
        description: { type: String, trim: true, default: '' },
        /** Legacy single rate — defaults to rateIndividualHuf when not set */
        defaultRate: { type: Number, default: 0, min: 0, max: 100 },
        rateIndividualHuf: { type: Number, default: 0, min: 0, max: 100 },
        rateOthers: { type: Number, default: 0, min: 0, max: 100 },
        rateTechnicalServices: { type: Number, default: 0, min: 0, max: 100 },
        singleBillThreshold: { type: Number, default: 0, min: 0 },
        /** FY aggregate threshold (legacy field name kept) */
        thresholdAmount: { type: Number, default: 0, min: 0 },
        thresholdCalculationMethod: {
            type: String,
            enum: ['SingleBill', 'AggregateFY', 'Both'],
            default: 'AggregateFY',
        },
        calculationType: {
            type: String,
            enum: ['PerTransaction', 'YearlyCumulative'],
            default: 'YearlyCumulative',
        },
        applicableLedgerGroups: { type: [String], default: [] },
        effectiveFrom: { type: Date, default: null },
        effectiveTo: { type: Date, default: null },
        autoDeductTds: { type: Boolean, default: true },
        /** ObjectId of the liability ledger under Duties & Taxes → TDS Payable (posting uses this id). */
        tdsPayableLedgerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AccountLedger',
            default: null,
        },
        /** Legacy: suggested / fallback label; posting prefers tdsPayableLedgerId. */
        tdsLedgerMapping: { type: String, trim: true, default: '' },
        natureOfPayment: { type: String, trim: true, default: '' },
        /** Payment nature for rate/threshold disambiguation (Professional vs Technical under 194J). */
        tdsNature: { type: String, trim: true, default: '' },
        /** Income-tax Act, 2025 s.393 table item (FY 2026-27+ returns). */
        section393TableItem: { type: String, trim: true, default: '' },
        section393Label: { type: String, trim: true, default: '' },
        panMandatory: { type: Boolean, default: false },
        lowerDeductionCertificateAllowed: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true },
        /** 206AA — typically 20%; applied as max(specified rate, this) when PAN invalid / not assumed available */
        panMissingRate: { type: Number, default: 20, min: 0, max: 100 },
        /**
         * After FY aggregate threshold is crossed:
         * ExcessOnly = TDS on amount above threshold (current bill excess when crossing, else full current bill)
         * FullAfterCrossing = catch-up TDS on full FY cumulative base less TDS already deducted
         */
        thresholdDeductMode: {
            type: String,
            enum: ['ExcessOnly', 'FullAfterCrossing'],
            default: 'FullAfterCrossing',
        },
        /** Empty = all FYs; else only listed canonical FY strings e.g. 2026-2027 */
        applicableFinancialYears: { type: [String], default: [] },
        remarks: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

tdsMasterSectionSchema.index({ sectionCode: 1 }, { unique: true });

export const TdsMasterSection = mongoose.model('TdsMasterSection', tdsMasterSectionSchema);
