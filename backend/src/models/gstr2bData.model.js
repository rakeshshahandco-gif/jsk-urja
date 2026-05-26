import mongoose from 'mongoose';

const gstr2bDataSchema = new mongoose.Schema({
    financialYear: { type: String, required: true, trim: true }, // e.g. "2025-2026"
    month: { type: String, required: true }, // e.g. "04"
    source: { type: String, enum: ['2A', '2B'], default: '2B' },
    
    // Supplier Info
    supplierGstin: { type: String, required: true, trim: true },
    supplierName: { type: String, default: '' },
    
    // Bill Info
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    invoiceType: { type: String, default: 'R' }, // R - Regular, C - Credit Note, D - Debit Note
    
    // Values
    taxableValue: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    cess: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    invoiceValue: { type: Number, default: 0 },
    
    // Filing Info
    filingDate: { type: Date },
    filingPeriod: { type: String },
    itcAvailable: { type: String, enum: ['Yes', 'No'], default: 'Yes' },
    isReverseCharge: { type: Boolean, default: false, index: true },
    importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstrImportBatch', default: null },
    reason: { type: String, default: '' },
    
    // Reconciliation Meta
    reconciliationStatus: { 
        type: String, 
        enum: [
            'Fully Matched', 
            'Matched with Rounding',
            'Books Only', 
            '2B Only', 
            'Mismatch',
            'Ineligible ITC',
            'Pending Supplier Filing'
        ],
        default: '2B Only'
    },
    matchingPurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInvoice', default: null },
    
    // Admin Overrides
    manualStatus: { type: String },
    remarks: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Compound index for matching
gstr2bDataSchema.index({ financialYear: 1, month: 1, source: 1 });
gstr2bDataSchema.index(
    { financialYear: 1, month: 1, source: 1, supplierGstin: 1, invoiceNumber: 1, invoiceDate: 1 },
    { unique: true },
);

export const Gstr2bData = mongoose.model('Gstr2bData', gstr2bDataSchema);
