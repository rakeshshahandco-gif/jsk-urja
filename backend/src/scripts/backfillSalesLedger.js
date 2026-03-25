/**
 * One-Time Backfill Script: Post Ledger Entries for All Existing Sales Invoices
 * Run: node src/scripts/backfillSalesLedger.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { SalesInvoice } from '../models/salesInvoice.model.js';
import { Voucher } from '../models/voucher.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';

const connectDB = async () => {
    const url = process.env.MONGODB_URL;
    if (!url) throw new Error('MONGODB_URL not found in environment');
    await mongoose.connect(url);
    console.log('Connected to MongoDB');
};

const postEntry = async (data) => {
    const { voucherId, voucherNo, date, ledgerId, amount, type, narration } = data;
    if (!amount || amount <= 0) return;
    const ledger = await AccountLedger.findById(ledgerId);
    if (!ledger) return;
    await LedgerEntry.create({ voucherId, voucherNo, date, ledgerId, ledgerName: ledger.name, amount, type, narration });
    const change = type === 'Debit' ? amount : -amount;
    ledger.currentBalance += change;
    await ledger.save();
};

const run = async () => {
    await connectDB();

    // Get system ledgers
    const salesLedger = await AccountLedger.findOne({ name: 'Sales Account' });
    const cgstLedger  = await AccountLedger.findOne({ name: 'CGST Output' });
    const sgstLedger  = await AccountLedger.findOne({ name: 'SGST Output' });
    const igstLedger  = await AccountLedger.findOne({ name: 'IGST Output' });
    const roundOffLedger = await AccountLedger.findOne({ name: 'Round Off' });

    if (!salesLedger) {
        console.error('❌ Sales Account ledger not found. Run accounting initialization first.');
        process.exit(1);
    }

    // Get/create Sales VoucherType
    let vType = await VoucherType.findOne({ nature: 'Sales' });
    if (!vType) {
        vType = await VoucherType.create({ name: 'Sales Invoice', nature: 'Sales', prefix: 'SAL/', autoNumbering: true });
        console.log('Created Sales VoucherType');
    }

    // Get all confirmed invoices that don't already have a voucher
    const invoices = await SalesInvoice.find({ status: { $ne: 'Cancelled' } }).lean();
    console.log(`Found ${invoices.length} invoices to process`);

    let posted = 0, skipped = 0, failed = 0;

    for (const invoice of invoices) {
        try {
            // Check if voucher already exists for this invoice
            const existingVoucher = await Voucher.findOne({ voucherNo: invoice.invoiceNumber, nature: 'Sales' });
            if (existingVoucher) {
                skipped++;
                continue;
            }

            // Find customer ledger
            const customerLedger = await AccountLedger.findOne({
                $or: [
                    { referenceId: invoice.customerId },
                    { name: invoice.customerName }
                ]
            });

            if (!customerLedger) {
                console.warn(`  ⚠️  No ledger for customer: ${invoice.customerName} (Invoice: ${invoice.invoiceNumber})`);
                failed++;
                continue;
            }

            const voucherNo = invoice.invoiceNumber;
            const date = invoice.invoiceDate || invoice.createdAt;
            const totalAmount = invoice.roundedTotal || invoice.grandTotal;

            // Create Voucher
            const voucher = await Voucher.create({
                voucherNo,
                voucherType: vType._id,
                nature: 'Sales',
                date,
                partyId: customerLedger._id,
                partyName: customerLedger.name,
                totalAmount,
                narration: `[Backfill] Sales Invoice ${invoice.invoiceNumber}`,
                status: 'Confirmed'
            });

            const vId = voucher._id;

            // Dr Customer
            await postEntry({ voucherId: vId, voucherNo, date, ledgerId: customerLedger._id, amount: totalAmount, type: 'Debit', narration: `Sale to ${invoice.customerName}` });
            // Cr Sales
            await postEntry({ voucherId: vId, voucherNo, date, ledgerId: salesLedger._id, amount: invoice.totalTaxableAmount, type: 'Credit', narration: 'Revenue from Sales' });
            // Cr GST
            if (invoice.totalCgst > 0 && cgstLedger)  await postEntry({ voucherId: vId, voucherNo, date, ledgerId: cgstLedger._id,  amount: invoice.totalCgst, type: 'Credit', narration: 'Output CGST' });
            if (invoice.totalSgst > 0 && sgstLedger)  await postEntry({ voucherId: vId, voucherNo, date, ledgerId: sgstLedger._id,  amount: invoice.totalSgst, type: 'Credit', narration: 'Output SGST' });
            if (invoice.totalIgst > 0 && igstLedger)  await postEntry({ voucherId: vId, voucherNo, date, ledgerId: igstLedger._id,  amount: invoice.totalIgst, type: 'Credit', narration: 'Output IGST' });
            if (invoice.roundOff && roundOffLedger) {
                const rType = invoice.roundOff > 0 ? 'Credit' : 'Debit';
                await postEntry({ voucherId: vId, voucherNo, date, ledgerId: roundOffLedger._id, amount: Math.abs(invoice.roundOff), type: rType, narration: 'Invoice Round Off' });
            }

            console.log(`  ✅ Posted: ${invoice.invoiceNumber} | Customer: ${invoice.customerName} | Amount: ₹${totalAmount}`);
            posted++;
        } catch (err) {
            console.error(`  ❌ Failed: ${invoice.invoiceNumber} — ${err.message}`);
            failed++;
        }
    }

    console.log(`\n=== Backfill Complete ===`);
    console.log(`✅ Posted:  ${posted}`);
    console.log(`⏭️  Skipped: ${skipped} (already had ledger entry)`);
    console.log(`❌ Failed:  ${failed}`);
    process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
