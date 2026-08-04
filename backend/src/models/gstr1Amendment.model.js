import mongoose from 'mongoose';

/**
 * GSTR-1 amendment record when the original return period is already Filed.
 * Does not overwrite filed return history or silent-cascade from Customer Master.
 */
const snapshotSchema = new mongoose.Schema(
    {
        customerGstin: { type: String, default: '' },
        customerRegistrationType: { type: String, default: '' },
        billingState: { type: String, default: '' },
        billingStateCode: { type: String, default: '' },
        placeOfSupply: { type: String, default: '' },
        gstType: { type: String, default: '' },
        classification: { type: String, default: '' },
    },
    { _id: false }
);

const gstr1AmendmentSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, default: '', trim: true },
        originalReturnPeriod: { type: String, required: true, trim: true }, // YYYY-MM of invoice
        amendmentPeriod: { type: String, default: '', trim: true },
        salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', required: true, index: true },
        invoiceNumber: { type: String, default: '' },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
        originalValues: { type: snapshotSchema, default: () => ({}) },
        correctedValues: { type: snapshotSchema, default: () => ({}) },
        amendmentReason: { type: String, required: true, trim: true },
        status: {
            type: String,
            enum: ['Amendment Required', 'Draft Amendment', 'Approved', 'Exported', 'Filed'],
            default: 'Amendment Required',
        },
        taxImpact: {
            type: String,
            enum: ['None', 'MetadataOnly', 'GstTypeChange', 'Blocked'],
            default: 'MetadataOnly',
        },
        accountingImpact: { type: String, default: 'None' },
        gstr1SheetImpact: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

gstr1AmendmentSchema.index({ companyId: 1, originalReturnPeriod: 1, status: 1 });

export const Gstr1Amendment = mongoose.model('Gstr1Amendment', gstr1AmendmentSchema);
