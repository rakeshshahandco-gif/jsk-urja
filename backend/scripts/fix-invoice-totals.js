import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { AccountLedger } from '../src/models/accountLedger.model.js';
import { postSalesInvoiceToLedger, reverseInvoiceLedgerImpact } from '../src/utils/ledgerDispatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fixInvoice() {
    const MONGODB_URL = process.env.MONGODB_URL;
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to MongoDB');

    const id = '69d3713aa24de4781a2364a8';
    const invoice = await SalesInvoice.findById(id);

    if (!invoice) {
        console.error('Invoice not found:', id);
        process.exit(1);
    }

    console.log('Found Invoice:', invoice.invoiceNumber, 'Party:', invoice.customerName);

    // Exact values requested by user
    const taxableItems = 2400;
    const freight = 50;
    const totalTaxable = 2450;
    const gstTotal = 441;
    const grandTotal = 2891;

    invoice.subTotal = taxableItems;
    invoice.freightAmount = freight;
    invoice.totalTaxableAmount = totalTaxable;
    invoice.totalTaxAmount = gstTotal;
    invoice.totalCgst = gstTotal / 2;
    invoice.totalSgst = gstTotal / 2;
    invoice.grandTotal = grandTotal;
    invoice.roundedTotal = grandTotal;
    invoice.amountInWords = 'Two Thousand Eight Hundred Ninety One Rupees Only';
    
    // Ensure all items have their taxable amount too
    if (invoice.items.length === 1) {
        invoice.items[0].taxableAmount = taxableItems;
        invoice.items[0].totalAmount = taxableItems + (taxableItems * 0.18); 
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Ensure Ledger exists
        let customerLedger = await AccountLedger.findOne({ referenceId: invoice.customerId });
        if (!customerLedger && invoice.customerName) {
            customerLedger = await AccountLedger.findOne({ name: invoice.customerName });
        }
        if (!customerLedger) {
            console.log('Creating legacy ledger for:', invoice.customerName);
            customerLedger = await AccountLedger.create([{
                name: invoice.customerName,
                referenceId: invoice.customerId,
                groupName: 'Sundry Debtors',
                openingBalance: 0,
                currentBalance: 0,
                createdBy: invoice.createdBy
            }], { session });
            customerLedger = customerLedger[0];
        }

        await invoice.save({ session });
        console.log('Invoice data updated.');

        // Re-post to Ledger
        await reverseInvoiceLedgerImpact(invoice.invoiceNumber, session);
        await postSalesInvoiceToLedger(invoice, invoice.createdBy, session);
        console.log('Ledger impact updated.');

        await session.commitTransaction();
        console.log('REPAIR COMPLETE: ' + invoice.invoiceNumber + ' is now ' + grandTotal);
    } catch (error) {
        await session.abortTransaction();
        console.error('Repair failed:', error);
    } finally {
        session.endSession();
        await mongoose.disconnect();
    }
}

fixInvoice();
