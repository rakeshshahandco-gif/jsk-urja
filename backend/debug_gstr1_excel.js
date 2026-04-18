/**
 * GSTR-1 Excel Debug Script
 * Directly queries DB and generates Excel to diagnose blank file issue
 * Run: node debug_gstr1_excel.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Connect to MongoDB ─────────────────────────────────────────────
console.log('🔌 Connecting to MongoDB...');
await mongoose.connect(process.env.MONGODB_URL);
console.log('✅ Connected!\n');

// ─── Load Model ─────────────────────────────────────────────────────
const siItemSchema = new mongoose.Schema({
    itemName: String,
    description: String,
    hsnCode: String,
    uom: String,
    qty: Number,
    rate: Number,
    uqc: String,
    taxableAmount: Number,
    gstRate: Number,
    cgstRate: Number, cgstAmount: Number,
    sgstRate: Number, sgstAmount: Number,
    igstRate: Number, igstAmount: Number,
    cessAmount: Number,
    totalAmount: Number,
}, { _id: false });

const salesInvoiceSchema = new mongoose.Schema({
    invoiceNumber: String,
    invoiceDate: Date,
    status: String,
    isDeleted: Boolean,
    gstApplicable: Boolean,
    gstType: String,
    customerName: String,
    customerGstin: String,
    customerRegistrationType: String,
    placeOfSupply: String,
    billingState: String,
    billingStateCode: String,
    shippingStateCode: String,
    reverseCharge: Boolean,
    roundedTotal: Number,
    grandTotal: Number,
    totalTaxableAmount: Number,
    totalCgst: Number,
    totalSgst: Number,
    totalIgst: Number,
    financialYear: String,
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries' },
    items: [siItemSchema],
}, { strict: false });

// Use existing model if already registered
const SalesInvoice = mongoose.models.SalesInvoice || mongoose.model('SalesInvoice', salesInvoiceSchema, 'salesinvoices');

// ─── STEP 1: Count all invoices ───────────────────────────────────────────
const totalCount = await SalesInvoice.countDocuments({});
const activeCount = await SalesInvoice.countDocuments({ status: { $ne: 'Cancelled' }, isDeleted: { $ne: true } });
console.log(`📊 Total invoices in DB: ${totalCount}`);
console.log(`📊 Active (non-cancelled, non-deleted): ${activeCount}`);

// ─── STEP 2: Sample one invoice to inspect its field structure ────────────
const sample = await SalesInvoice.findOne({ status: { $ne: 'Cancelled' }, isDeleted: { $ne: true } }).lean();
if (sample) {
    console.log('\n🔍 Sample Invoice Fields:');
    console.log(`  invoiceNumber: ${sample.invoiceNumber}`);
    console.log(`  invoiceDate: ${sample.invoiceDate}`);
    console.log(`  status: ${sample.status}`);
    console.log(`  isDeleted: ${sample.isDeleted}`);
    console.log(`  gstApplicable: ${sample.gstApplicable}`);
    console.log(`  gstType: ${sample.gstType}`);
    console.log(`  customerName: ${sample.customerName}`);
    console.log(`  customerGstin: "${sample.customerGstin}"`);
    console.log(`  customerRegistrationType: "${sample.customerRegistrationType}"`);
    console.log(`  placeOfSupply: "${sample.placeOfSupply}"`);
    console.log(`  roundedTotal: ${sample.roundedTotal}`);
    console.log(`  grandTotal: ${sample.grandTotal}`);
    console.log(`  financialYear: "${sample.financialYear}"`);
    console.log(`  items count: ${sample.items?.length}`);
    
    if (sample.items && sample.items.length > 0) {
        const item = sample.items[0];
        console.log('\n  📦 First Item Fields:');
        console.log(`    itemName: ${item.itemName}`);
        console.log(`    hsnCode: "${item.hsnCode}"`);
        console.log(`    qty: ${item.qty}`);
        console.log(`    rate: ${item.rate}`);
        console.log(`    taxableAmount: ${item.taxableAmount}`);
        console.log(`    gstRate: ${item.gstRate}   ← KEY FIELD`);
        console.log(`    cgstAmount: ${item.cgstAmount}   ← KEY FIELD`);
        console.log(`    sgstAmount: ${item.sgstAmount}   ← KEY FIELD`);
        console.log(`    igstAmount: ${item.igstAmount}   ← KEY FIELD`);
        // Check for old field names
        console.log(`    taxRate (old field): ${item.taxRate}   ← OLD FIELD`);
        console.log(`    taxAmount (old field): ${item.taxAmount}   ← OLD FIELD`);
    }
} else {
    console.log('⚠️  No active invoices found!');
}

// ─── STEP 3: Check date range (April 2026) ────────────────────────────────
const aprilFrom = new Date('2026-04-01');
const aprilTo = new Date('2026-04-30T23:59:59.999Z');
const aprilCount = await SalesInvoice.countDocuments({
    status: { $ne: 'Cancelled' },
    isDeleted: { $ne: true },
    invoiceDate: { $gte: aprilFrom, $lte: aprilTo }
});
console.log(`\n📅 Invoices in April 2026: ${aprilCount}`);

// ─── STEP 4: Check gstApplicable field distribution ──────────────────────
const gstApplicableFalse = await SalesInvoice.countDocuments({ gstApplicable: false });
const gstApplicableTrue = await SalesInvoice.countDocuments({ gstApplicable: true });
const gstApplicableNull = await SalesInvoice.countDocuments({ gstApplicable: { $exists: false } });
console.log(`\n🔎 gstApplicable=false: ${gstApplicableFalse}`);
console.log(`🔎 gstApplicable=true: ${gstApplicableTrue}`);
console.log(`🔎 gstApplicable not set: ${gstApplicableNull}`);

// ─── STEP 5: Now run the actual service and generate Excel ────────────────
console.log('\n📊 Generating GSTR-1 Excel with April 2026 filter...');

import { generateGSTR1Excel } from './src/services/gstr1.service.js';

try {
    const buffer = await generateGSTR1Excel({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30'
    });
    
    const outPath = path.join(__dirname, 'test_gstr1_output.xlsx');
    fs.writeFileSync(outPath, buffer);
    console.log(`✅ Excel generated! Size: ${buffer.length} bytes`);
    console.log(`📁 Saved to: ${outPath}`);
    
    if (buffer.length < 6000) {
        console.log('⚠️  WARNING: File is very small - likely has empty sheets!');
    } else {
        console.log('✅ File size looks healthy - should contain real data');
    }
} catch (err) {
    console.error('❌ Excel generation failed:', err.message);
    console.error(err.stack);
}

// ─── STEP 6: Create a test invoice if needed ─────────────────────────────
if (aprilCount === 0) {
    console.log('\n🔧 No April invoices found! Creating a test invoice...');
    // ... will be added if needed
}

await mongoose.disconnect();
console.log('\n🔌 Disconnected from MongoDB');
process.exit(0);
