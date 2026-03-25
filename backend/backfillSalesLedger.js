import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { SalesInvoice } from './src/models/salesInvoice.model.js';
import { PurchaseInvoice } from './src/models/purchaseInvoice.model.js';
import { postSalesInvoiceToLedger, reverseInvoiceLedgerImpact } from './src/utils/ledgerDispatcher.js';
import { Voucher } from './src/models/voucher.model.js';
import { AccountLedger } from './src/models/accountLedger.model.js';
import { AccountGroup } from './src/models/accountGroup.model.js';
import { connectDB } from './src/config/db.js';

async function setupSystemLedgers() {
    console.log('Verifying System Ledgers...');
    const directIncomeGroup = await AccountGroup.findOne({ name: 'Direct Income' });
    if (!directIncomeGroup) throw new Error('Direct Income group missing!');
    
    let freightLedger = await AccountLedger.findOne({ name: 'Freight & Forwarding Charges' });
    if (!freightLedger) {
        await AccountLedger.create({
            name: 'Freight & Forwarding Charges',
            underGroup: directIncomeGroup._id,
            groupName: directIncomeGroup.name,
            openingBalance: 0,
            currentBalance: 0,
            isSystem: true
        });
        console.log('Created Freight & Forwarding Charges ledger.');
    }
}

async function backfill() {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Connected.');
    await setupSystemLedgers();
    
    // Process Sales Invoices
    const salesInvoices = await SalesInvoice.find({ status: 'Confirmed' });
    console.log(`Found ${salesInvoices.length} Confirmed Sales Invoices.`);
    
    let salesSuccess = 0, salesFail = 0;
    
    for (const inv of salesInvoices) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const existingVoucher = await Voucher.findOne({ voucherNo: inv.invoiceNumber }).session(session);
            if (existingVoucher && existingVoucher.status !== 'Cancelled') {
                await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
            }
            
            await postSalesInvoiceToLedger(inv, inv.createdBy || '651234567890123456789012', session);
            await session.commitTransaction();
            console.log(`Successfully mapped Sales Invoice: ${inv.invoiceNumber}`);
            salesSuccess++;
        } catch (e) {
            await session.abortTransaction();
            console.error(`Failed to map Sales Invoice ${inv.invoiceNumber}: ${e.message}`);
            salesFail++;
        } finally {
            session.endSession();
        }
    }
    
    console.log(`\nSales Done: ${salesSuccess} Success | ${salesFail} Failed\n`);
    
    process.exit(0);
}

backfill();
