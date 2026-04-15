import mongoose from 'mongoose';

const stockLedgerSchema = new mongoose.Schema({
    date: { type: Date, required: true, default: Date.now },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, default: '' },
    itemName: { type: String, default: '' },
    transactionType: {
        type: String,
        enum: ['GRN', 'WO_CONSUMPTION', 'WO_OUTPUT', 'COMPONENT_REPLACEMENT', 'PROD_REJECTION',
            'OPENING', 'ADJUSTMENT', 'RETURN', 'PURCHASE_INVOICE', 'PURCHASE_INVOICE_DELETE',
            'REPLACEMENT_DISPATCH', 'FAULTY_RECEIPT', 'REPAIR_INWARD', 'REPAIR_TO_QC', 'SCRAP_ENTRY',
            'PROD_FAILURE', 'REWORK_ISSUE', 'REWORK_CONSUMPTION', 'REWORK_QC_PASS', 'REWORK_SCRAP', 'SALES_INVOICE', 'SALES_INVOICE_CANCEL', 'SALES_INVOICE_RESTORE', 'MODEL_CONVERSION'],
        required: true,
    },
    stockBucket: {
        type: String,
        enum: ['SALEABLE', 'FAULTY', 'REPAIR', 'SCRAP', 'REPLACEMENT_DISPATCHED', 'FAILED_PRODUCTION'],
        default: 'SALEABLE'
    },
    referenceNo: { type: String, default: '' }, // GRN No, PO No, etc.
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    inQty: { type: Number, default: 0 },
    outQty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    runningStock: { type: Number, default: 0 }, // stock after this entry
    warehouse: { type: String, default: '' },
    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
}, { timestamps: true });

stockLedgerSchema.index({ itemId: 1, date: -1 });
stockLedgerSchema.index({ transactionType: 1 });
stockLedgerSchema.index({ financialYear: 1 });

const StockLedger = mongoose.model('StockLedger', stockLedgerSchema);
export { StockLedger };
