/**
 * bulk_repair_pi_ledger.cjs
 * 
 * Repairs ALL Purchase Invoice ledger entries.
 * For each confirmed/active purchase invoice it:
 *   1. Reverses (hard-deletes) the existing bad ledger entries + voucher
 *   2. Re-posts the correct entries using grandTotal-based derivation
 *
 * Run with: node bulk_repair_pi_ledger.cjs
 */

'use strict';

const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });

const MONGO_URL = process.env.MONGODB_URL;

// ─── Inline Schema Definitions ────────────────────────────────────────────────
const accountGroupSchema = new mongoose.Schema({ name: String, nature: String, parentGroup: mongoose.Schema.Types.ObjectId }, { timestamps: true });
const AccountGroup = mongoose.model('AccountGroup', accountGroupSchema);

const accountLedgerSchema = new mongoose.Schema({
    name: String, type: String, underGroup: mongoose.Schema.Types.ObjectId,
    groupName: String, referenceId: mongoose.Schema.Types.ObjectId,
    currentBalance: { type: Number, default: 0 }, openingBalance: { type: Number, default: 0 },
    isCashLedger: Boolean, isBank: Boolean, isTaxLedger: Boolean
}, { timestamps: true });
const AccountLedger = mongoose.model('AccountLedger', accountLedgerSchema);

const ledgerEntrySchema = new mongoose.Schema({
    voucherId: mongoose.Schema.Types.ObjectId, voucherNo: String, date: Date,
    ledgerId: mongoose.Schema.Types.ObjectId, ledgerName: String,
    amount: Number, type: String, narration: String
}, { timestamps: true });
const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);

const voucherTypeSchema = new mongoose.Schema({ name: String, nature: String, prefix: String, autoNumbering: Boolean, createdBy: mongoose.Schema.Types.ObjectId }, { timestamps: true });
const VoucherType = mongoose.model('VoucherType', voucherTypeSchema);

const voucherSchema = new mongoose.Schema({
    voucherNo: String, voucherType: mongoose.Schema.Types.ObjectId, nature: String,
    date: Date, partyId: mongoose.Schema.Types.ObjectId, partyName: String,
    totalAmount: Number, narration: String, isSystemGenerated: Boolean,
    createdBy: mongoose.Schema.Types.ObjectId, status: String
}, { timestamps: true });
const Voucher = mongoose.model('Voucher', voucherSchema);

const piItemSchema = new mongoose.Schema({
    itemId: mongoose.Schema.Types.ObjectId, itemCode: String, itemName: String,
    qty: Number, rate: Number, gstRate: { type: Number, default: 18 },
    discountAmount: { type: Number, default: 0 }
});

const purchaseInvoiceSchema = new mongoose.Schema({
    invoiceNumber: String, invoiceDate: Date, supplierId: mongoose.Schema.Types.ObjectId,
    supplierName: String, gstType: String, items: [piItemSchema],
    subTotal: Number, totalDiscount: Number, totalTaxableAmount: Number,
    totalCgst: { type: Number, default: 0 }, totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 }, totalTax: Number,
    freightAmount: { type: Number, default: 0 }, freightGstRate: { type: Number, default: 0 },
    freightIgstAmount: { type: Number, default: 0 }, freightTotalGst: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 }, grandTotal: Number,
    status: String, isDeleted: { type: Boolean, default: false },
    paymentStatus: String
}, { timestamps: true });
const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const r2 = (n) => Math.round((n || 0) * 100) / 100;

async function reverseInvoiceLedgerImpact(voucherNo, session) {
    const voucher = await Voucher.findOne({ voucherNo }).session(session);
    if (!voucher) return false;
    if (voucher.status === 'Cancelled') return false;

    const entries = await LedgerEntry.find({ voucherId: voucher._id }).session(session);
    for (const entry of entries) {
        const ledger = await AccountLedger.findById(entry.ledgerId).session(session);
        if (ledger) {
            const reverseChange = entry.type === 'Debit' ? -entry.amount : entry.amount;
            ledger.currentBalance += reverseChange;
            await ledger.save({ session });
        }
    }
    await LedgerEntry.deleteMany({ voucherId: voucher._id }).session(session);
    await Voucher.deleteOne({ _id: voucher._id }).session(session);
    return true;
}

async function postEntry(data, session) {
    const { voucherId, voucherNo, date, ledgerId, amount, type, narration } = data;
    if (!amount || amount <= 0) return;

    const ledger = await AccountLedger.findById(ledgerId).session(session);
    if (!ledger) {
        console.warn(`  ⚠️  Ledger ${ledgerId} not found, skipping entry`);
        return;
    }

    await LedgerEntry.create([{ voucherId, voucherNo, date, ledgerId, ledgerName: ledger.name, amount, type, narration }], { session });

    const change = type === 'Debit' ? amount : -amount;
    ledger.currentBalance += change;
    await ledger.save({ session });
}

async function postPurchaseInvoiceToLedger(invoice, session) {
    // 1. Get Voucher Type
    let vType = await VoucherType.findOne({ nature: 'Purchase' }).session(session);
    if (!vType) {
        vType = await VoucherType.create([{ name: 'Purchase Invoice', nature: 'Purchase', prefix: 'PUR/', autoNumbering: true }], { session });
        vType = vType[0];
    }

    const voucherNo = invoice.invoiceNumber;
    const date = invoice.invoiceDate || new Date();

    // 2. Find ledgers
    let supplierLedger;
    if (invoice.supplierId) supplierLedger = await AccountLedger.findOne({ referenceId: invoice.supplierId }).session(session);
    if (!supplierLedger && invoice.supplierName) supplierLedger = await AccountLedger.findOne({ name: invoice.supplierName }).session(session);

    const purchaseLedger   = await AccountLedger.findOne({ name: 'Purchase Account' }).session(session);
    const cgstInputLedger  = await AccountLedger.findOne({ name: 'CGST Input' }).session(session);
    const sgstInputLedger  = await AccountLedger.findOne({ name: 'SGST Input' }).session(session);
    const igstInputLedger  = await AccountLedger.findOne({ name: 'IGST Input' }).session(session);
    const roundOffLedger   = await AccountLedger.findOne({ name: 'Round Off' }).session(session);
    const freightLedger    = await AccountLedger.findOne({ name: 'Freight Inward' }).session(session);

    if (!supplierLedger) { console.warn(`  ⚠️  No supplier ledger for ${invoice.supplierName}, skipping`); return null; }
    if (!purchaseLedger) { console.warn(`  ⚠️  No Purchase Account ledger, skipping`); return null; }

    // 3. Resolve amounts — derive Purchase debit from grandTotal to guarantee balance
    const grandTotal    = Math.round(invoice.grandTotal || 0);
    const freightAmt    = r2(invoice.freightAmount || 0);
    const igstAmt       = r2(invoice.totalIgst   || 0);
    const cgstAmt       = r2(invoice.totalCgst   || 0);
    const sgstAmt       = r2(invoice.totalSgst   || 0);
    const roundOffAmt   = invoice.roundOff || 0;
    const roundOffDebit  = roundOffAmt > 0 ? r2(roundOffAmt) : 0;
    const roundOffCredit = roundOffAmt < 0 ? r2(Math.abs(roundOffAmt)) : 0;

    // Purchase Account = grandTotal − taxes − freight − roundOff
    const purchaseDebit = r2(grandTotal - igstAmt - cgstAmt - sgstAmt - freightAmt - roundOffDebit + roundOffCredit);

    // 4. Create Voucher
    const [voucher] = await Voucher.create([{
        voucherNo, voucherType: vType._id, nature: 'Purchase', date,
        partyId: supplierLedger._id, partyName: supplierLedger.name,
        totalAmount: grandTotal,
        narration: `Auto-generated from Purchase Invoice ${invoice.invoiceNumber} from ${invoice.supplierName}`,
        isSystemGenerated: true, status: 'Confirmed'
    }], { session });

    const vId = voucher._id;

    // 5. Post debit entries
    if (purchaseDebit > 0) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: purchaseLedger._id, amount: purchaseDebit, type: 'Debit', narration: 'Direct Purchase' }, session);
    if (freightAmt > 0 && freightLedger) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: freightLedger._id, amount: freightAmt, type: 'Debit', narration: 'Freight Inward Expense' }, session);
    if (cgstAmt > 0 && cgstInputLedger) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: cgstInputLedger._id, amount: cgstAmt, type: 'Debit', narration: 'Input CGST' }, session);
    if (sgstAmt > 0 && sgstInputLedger) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: sgstInputLedger._id, amount: sgstAmt, type: 'Debit', narration: 'Input SGST' }, session);
    if (igstAmt > 0 && igstInputLedger) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: igstInputLedger._id, amount: igstAmt, type: 'Debit', narration: 'Input IGST' }, session);
    if (roundOffDebit > 0 && roundOffLedger) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: roundOffLedger._id, amount: roundOffDebit, type: 'Debit', narration: 'Invoice Round Off' }, session);
    if (roundOffCredit > 0 && roundOffLedger) await postEntry({ voucherId: vId, voucherNo, date, ledgerId: roundOffLedger._id, amount: roundOffCredit, type: 'Credit', narration: 'Invoice Round Off' }, session);

    // 6. Credit Supplier (always = grandTotal — guaranteed to balance)
    await postEntry({ voucherId: vId, voucherNo, date, ledgerId: supplierLedger._id, amount: grandTotal, type: 'Credit', narration: `Purchased from ${invoice.supplierName}` }, session);

    return vId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected\n');

    // Get all active (non-deleted, non-cancelled) purchase invoices
    const invoices = await PurchaseInvoice.find({
        isDeleted: { $ne: true },
        status: { $nin: ['Cancelled', 'Draft'] }
    }).sort({ invoiceDate: 1 }).lean();

    console.log(`📋 Found ${invoices.length} active purchase invoices to repair\n`);

    let repaired = 0, skipped = 0, errors = 0;

    for (const inv of invoices) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const wasReversed = await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
            const vId = await postPurchaseInvoiceToLedger(inv, session);

            if (vId) {
                await session.commitTransaction();
                const grandTotal = Math.round(inv.grandTotal || 0);
                const igst = r2(inv.totalIgst || 0);
                const freight = r2(inv.freightAmount || 0);
                const purchase = r2(grandTotal - igst - r2(inv.totalCgst || 0) - r2(inv.totalSgst || 0) - freight - (inv.roundOff > 0 ? r2(inv.roundOff) : 0) + (inv.roundOff < 0 ? r2(Math.abs(inv.roundOff)) : 0));
                console.log(`  ✅ ${inv.invoiceNumber} (${inv.supplierName}) ₹${grandTotal} → Purchase:₹${purchase} IGST:₹${igst} Freight:₹${freight}`);
                repaired++;
            } else {
                await session.abortTransaction();
                console.log(`  ⏭️  ${inv.invoiceNumber} — skipped (no supplier ledger)`);
                skipped++;
            }
        } catch (err) {
            await session.abortTransaction();
            console.error(`  ❌ ${inv.invoiceNumber} — ERROR: ${err.message}`);
            errors++;
        } finally {
            session.endSession();
        }
    }

    console.log(`\n═══════════════════════════════════════`);
    console.log(`  Repaired : ${repaired}`);
    console.log(`  Skipped  : ${skipped}`);
    console.log(`  Errors   : ${errors}`);
    console.log(`═══════════════════════════════════════`);

    await mongoose.disconnect();
    console.log('\n✅ Done. Ledger balances updated for all purchase invoices.');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
