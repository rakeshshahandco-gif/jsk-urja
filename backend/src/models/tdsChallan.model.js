import mongoose from 'mongoose';
import { tenantSchemaPlugin } from '../plugins/tenantSchema.plugin.js';

const challanLineItemSchema = new mongoose.Schema(
    {
        source: { type: String, enum: ['voucher', 'deduction'], required: true },
        sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
        rowKey: { type: String, default: '' },
        deductionDate: { type: Date },
        voucherNo: { type: String, default: '' },
        supplierName: { type: String, default: '' },
        deducteePan: { type: String, default: '' },
        section: { type: String, default: '' },
        payableLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
        payableLedgerName: { type: String, default: '' },
        taxableAmount: { type: Number, default: 0 },
        tdsAmount: { type: Number, default: 0 },
        alreadyPaidAmount: { type: Number, default: 0 },
        balanceBefore: { type: Number, default: 0 },
        payAmount: { type: Number, required: true, min: 0 },
        quarter: { type: String, default: '' },
    },
    { _id: false },
);

const sectionSummarySchema = new mongoose.Schema(
    {
        section: { type: String, required: true },
        taxableTotal: { type: Number, default: 0 },
        tdsTotal: { type: Number, default: 0 },
        paidTotal: { type: Number, default: 0 },
    },
    { _id: false },
);

const tdsChallanSchema = new mongoose.Schema(
    {
        /** Internal CRM reference e.g. TDS/26-27/0001 */
        challanNo: { type: String, trim: true, default: '' },
        bsrCode: { type: String, trim: true, default: '' },
        challanSerial: { type: String, trim: true, default: '' },
        bankName: { type: String, trim: true, default: '' },
        challanDate: { type: Date, required: true },
        periodFrom: { type: Date, default: null },
        periodTo: { type: Date, default: null },
        amountDeposited: { type: Number, required: true, min: 0 },
        interest: { type: Number, default: 0, min: 0 },
        lateFee: { type: Number, default: 0, min: 0 },
        penalty: { type: Number, default: 0, min: 0 },
        totalPaidAmount: { type: Number, default: 0, min: 0 },
        totalTaxableAmount: { type: Number, default: 0, min: 0 },
        totalTdsAmount: { type: Number, default: 0, min: 0 },
        balanceAmount: { type: Number, default: 0, min: 0 },
        financialYear: { type: String, trim: true, default: '' },
        primaryQuarter: { type: String, trim: true, default: '' },
        assessmentYear: { type: String, trim: true, default: '' },
        assessmentYearOverrideReason: { type: String, trim: true, default: '' },
        cinNumber: { type: String, trim: true, default: '' },
        paymentMode: {
            type: String,
            enum: ['', 'Net Banking', 'Debit Card', 'Credit Card', 'UPI', 'Cash', 'Other'],
            default: '',
        },
        status: {
            type: String,
            enum: ['Draft', 'Generated', 'Paid', 'Part Paid', 'Cancelled', 'Pending', 'Matched'],
            default: 'Draft',
        },
        remarks: { type: String, trim: true, default: '' },
        lineItems: [challanLineItemSchema],
        sectionWiseSummary: [sectionSummarySchema],
        receiptFileUrl: { type: String, trim: true, default: '' },
        paymentVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
        bankLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
        accountingPosted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        paidAt: { type: Date, default: null },
    },
    { timestamps: true },
);

tdsChallanSchema.plugin(tenantSchemaPlugin);
tdsChallanSchema.index({ challanDate: -1 });
tdsChallanSchema.index({ companyId: 1, challanNo: 1 }, { unique: true });
tdsChallanSchema.index({ companyId: 1, financialYear: 1, status: 1 });
tdsChallanSchema.index(
    { companyId: 1, financialYear: 1, bsrCode: 1, challanSerial: 1 },
    { sparse: true },
);

export const TdsChallan = mongoose.model('TdsChallan', tdsChallanSchema);
