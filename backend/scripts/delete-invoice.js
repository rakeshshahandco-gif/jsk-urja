import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { AccountLedger } from '../src/models/accountLedger.model.js';
import { reverseInvoiceLedgerImpact } from '../src/utils/ledgerDispatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function deleteInvoice() {
    const MONGODB_URL = process.env.MONGODB_URL;
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to MongoDB');

    const id = '69d3713aa24de4781a23649c'; // From screenshot ID
    const invoice = await SalesInvoice.findById(id);

    if (!invoice) {
        console.error('Invoice not found:', id);
        process.exit(1);
    }

    const { invoiceNumber, customerName } = invoice;
    console.log(`Targeting Invoice: ${invoiceNumber} for ${customerName}`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Reverse and HARD DELETE Ledger impact (Vouchers + Ledger Entries)
        // reverseInvoiceLedgerImpact already handles this cleanly
        await reverseInvoiceLedgerImpact(invoiceNumber, session);
        console.log('Ledger and voucher records removed.');

        // 2. Hard delete the Invoice itself
        await SalesInvoice.deleteOne({ _id: id }).session(session);
        console.log('Sales record permanently deleted.');

        await session.commitTransaction();
        console.log(`SUCCESS: Invoice ${invoiceNumber} has been completely removed.`);
        console.log(`You can now re-create this invoice with the same number.`);
    } catch (error) {
        await session.abortTransaction();
        console.error('Deletion failed:', error);
    } finally {
        session.endSession();
        await mongoose.disconnect();
    }
}

deleteInvoice();
