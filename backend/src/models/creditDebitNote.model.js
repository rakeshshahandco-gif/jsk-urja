import mongoose from 'mongoose';

const cdnItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    hsnCode: { type: String, default: '' },
    uom: { type: String, default: 'NOS' },
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    uqc: { type: String, default: '' },
    hsnSacId: { type: mongoose.Schema.Types.ObjectId, ref: 'HsnMaster' },
    taxableAmount: { type: Number, default: 0 },
    gstRate: { type: Number, default: 18 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    cessAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
}, { _id: true });

const creditDebitNoteSchema = new mongoose.Schema({
    noteType: { type: String, enum: ['Credit Note', 'Debit Note'], required: true },
    noteNumber: { type: String, required: true, unique: true, trim: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
    noteDate: { type: Date, required: true, default: Date.now },

    // Original Invoice Reference
    originalInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },
    originalInvoiceNumber: { type: String, default: '' },
    originalInvoiceDate: { type: Date, default: null },
    
    // Customer Info
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true },
    customerGstin: { type: String, default: '' },
    customerRegistrationType: { type: String, default: '' },
    billingAddress: { type: String, default: '' },
    billingState: { type: String, default: '' },
    billingStateCode: { type: String, default: '' },
    
    // GST Info
    gstType: { type: String, default: 'CGST / SGST' },
    placeOfSupply: { type: String, default: '' },
    reverseCharge: { type: Boolean, default: false },
    noteSupplyType: { type: String, enum: ['Regular', 'SEZ', 'Deemed Export', 'Export', ''], default: 'Regular' },
    reason: { type: String, default: '' },

    // Items
    items: [cdnItemSchema],

    // Totals
    totalTaxableAmount: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalGst: { type: Number, default: 0 },
    totalCessAmount: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    status: { type: String, enum: ['Draft', 'Final', 'Cancelled'], default: 'Draft' },
    remarks: { type: String, default: '' },
    
    financialYear: { type: String, trim: true },
    sequenceNumber: { type: Number, default: 0 },

    // Phase 4A — Customer Credit Note accounting link + derived application cache (not manually editable)
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    linkedVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
    accountingPostedAt: { type: Date, default: null },
    /** Cached sum of active Credit Note→SI allocations; rebuilt from BillWiseAdjustment. */
    appliedAmount: { type: Number, default: 0, min: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Cancellation
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: '' },

    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

creditDebitNoteSchema.index({ noteNumber: 1 });
creditDebitNoteSchema.index({ customerId: 1, noteDate: -1 });
creditDebitNoteSchema.index({ noteType: 1 });
creditDebitNoteSchema.index({ financialYear: 1 });

const CreditDebitNote = mongoose.model('CreditDebitNote', creditDebitNoteSchema);
export { CreditDebitNote };
