/**
 * GSTR-1 Invoice Data Inspector
 * Run: node inspect_april_invoices.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

console.log('🔌 Connecting to MongoDB...');
await mongoose.connect(process.env.MONGODB_URL);
console.log('✅ Connected!\n');

// Raw query - no model registration issues
const db = mongoose.connection.db;
const invoices = await db.collection('salesinvoices').find({
    status: { $ne: 'Cancelled' },
    isDeleted: { $ne: true },
    invoiceDate: {
        $gte: new Date('2026-04-01'),
        $lte: new Date('2026-04-30T23:59:59.999Z')
    }
}).project({
    invoiceNumber: 1,
    invoiceDate: 1,
    customerName: 1,
    customerGstin: 1,
    customerRegistrationType: 1,
    gstType: 1,
    gstApplicable: 1,
    placeOfSupply: 1,
    billingState: 1,
    billingStateCode: 1,
    roundedTotal: 1,
    grandTotal: 1,
    'items.itemName': 1,
    'items.hsnCode': 1,
    'items.qty': 1,
    'items.taxableAmount': 1,
    'items.gstRate': 1,
    'items.igstAmount': 1,
    'items.cgstAmount': 1,
    'items.sgstAmount': 1,
}).toArray();

console.log(`📊 April 2026 invoices: ${invoices.length}\n`);

invoices.forEach((inv, i) => {
    console.log(`--- Invoice ${i+1}: ${inv.invoiceNumber} ---`);
    console.log(`  customerGstin: "${inv.customerGstin}"`);
    console.log(`  customerRegistrationType: "${inv.customerRegistrationType}"`);
    console.log(`  gstType: "${inv.gstType}"`);
    console.log(`  gstApplicable: ${inv.gstApplicable}`);
    console.log(`  placeOfSupply: "${inv.placeOfSupply}"`);
    console.log(`  billingState: "${inv.billingState}"`);
    console.log(`  items: ${inv.items?.length}`);
    if (inv.items?.length > 0) {
        const it = inv.items[0];
        console.log(`  item[0]: gstRate=${it.gstRate}, igst=${it.igstAmount}, cgst=${it.cgstAmount}, sgst=${it.sgstAmount}, taxableAmount=${it.taxableAmount}`);
    }
});

await mongoose.disconnect();
