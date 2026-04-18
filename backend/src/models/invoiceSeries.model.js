import mongoose from 'mongoose';

const invoiceSeriesSchema = new mongoose.Schema({
    seriesName: { type: String, required: true, trim: true },
    financialYear: { type: String, required: true, trim: true }, // e.g. "25-26"
    prefix: { type: String, required: true, trim: true }, // e.g. "25-26/"
    startNumber: { type: Number, default: 1 },
    currentNumber: { type: Number, default: 0 }, // last used number (0 = none used yet)
    padLength: { type: Number, default: 5 },  // zero pad: 00001
    gstApplicable: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isEstimate: { type: Boolean, default: false }, // Legacy flag, mapping via documentType is preferred now
    documentType: { 
        type: String, 
        enum: ['Tax Invoice', 'Credit Note', 'Debit Note', 'Bill of Supply', 'Estimate', 'Delivery Challan', ''], 
        default: '' 
    },
    issuedCount: { type: Number, default: 0 },
    cancelledCount: { type: Number, default: 0 },
    description: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

invoiceSeriesSchema.index({ financialYear: 1 });

// Helper: generate next number as string  e.g. "25-26/00001"
invoiceSeriesSchema.methods.nextInvoiceNumber = function () {
    const next = Math.max(this.currentNumber + 1, this.startNumber);
    const padded = String(next).padStart(this.padLength, '0');
    return `${this.prefix}${padded}`;
};

const InvoiceSeries = mongoose.model('InvoiceSeries', invoiceSeriesSchema);
export { InvoiceSeries };
