import mongoose from 'mongoose';

/**
 * Stores one month of portal-downloaded GSTR-1 or GSTR-3B data for GSTR-9 reconciliation.
 * One document = one filing period (month) + one form type.
 */
const gstr9PortalImportSchema = new mongoose.Schema(
  {
    financialYear: { type: String, required: true, trim: true, index: true }, // "2025-2026"
    month:         { type: String, required: true, index: true },              // "04" – "03"
    formType:      { type: String, enum: ['GSTR1', 'GSTR3B'], required: true, index: true },
    gstin:         { type: String, default: '', trim: true },
    filingPeriod:  { type: String, default: '' }, // "MMYYYY" as on portal

    // ── Outward supply summary (from GSTR-1 or GSTR-3B sup_details) ──────────
    outwardTaxableValue: { type: Number, default: 0 },
    outwardIgst:         { type: Number, default: 0 },
    outwardCgst:         { type: Number, default: 0 },
    outwardSgst:         { type: Number, default: 0 },
    outwardCess:         { type: Number, default: 0 },

    nilExemptValue: { type: Number, default: 0 },  // nil/exempt outward
    zeroRatedValue: { type: Number, default: 0 },  // exports

    // ── ITC summary (from GSTR-3B itc_elg) ────────────────────────────────
    itcIgst: { type: Number, default: 0 },
    itcCgst: { type: Number, default: 0 },
    itcSgst: { type: Number, default: 0 },
    itcRcmIgst: { type: Number, default: 0 },
    itcRcmCgst: { type: Number, default: 0 },
    itcRcmSgst: { type: Number, default: 0 },

    // ── Tax paid (from GSTR-3B) ────────────────────────────────────────────
    taxPaidIgst: { type: Number, default: 0 },
    taxPaidCgst: { type: Number, default: 0 },
    taxPaidSgst: { type: Number, default: 0 },
    taxPaidCess: { type: Number, default: 0 },

    // ── HSN rows (from GSTR-1 hsn table) ──────────────────────────────────
    hsnRows: [
      {
        hsn:          String,
        description:  String,
        uom:          String,
        qty:          Number,
        taxableValue: Number,
        igst:         Number,
        cgst:         Number,
        sgst:         Number,
        cess:         Number,
        gstRate:      Number,
      },
    ],

    // ── Import meta ────────────────────────────────────────────────────────
    fileName:    { type: String, default: '' },
    fileHash:    { type: String, default: '', index: true },
    importedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rowCount:    { type: Number, default: 0 },
    parseErrors: [String],
    rawData:     { type: mongoose.Schema.Types.Mixed, default: null }, // stores full portal JSON
  },
  { timestamps: true },
);

gstr9PortalImportSchema.index({ financialYear: 1, month: 1, formType: 1 }, { unique: true });

const Gstr9PortalImport = mongoose.model('Gstr9PortalImport', gstr9PortalImportSchema);
export { Gstr9PortalImport };
