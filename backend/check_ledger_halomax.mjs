
import mongoose from 'mongoose';
import { AccountLedger } from './src/models/accountLedger.model.js';
import { SalesInvoice } from './src/models/salesInvoice.model.js';
import { LedgerEntry } from './src/models/ledgerEntry.model.js';
import { Voucher } from './src/models/voucher.model.js';

async function checkLedger() {
    await mongoose.connect('mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true');
    
    const name = "HALOMAX LIGHTING SOLUTIONS PVT. LTD.";
    console.log(`Checking ledger for: ${name}`);
    
    const ledgers = await AccountLedger.find({ name: { $regex: name, $options: 'i' } });
    console.log(`Found ${ledgers.length} ledgers:`);
    ledgers.forEach(l => {
        console.log(`ID: ${l._id}, Name: ${l.name}, ReferenceId: ${l.referenceId}, RefModel: ${l.referenceModel}, Balance: ${l.currentBalance}`);
    });
    
    if (ledgers.length > 0) {
        const ledgerId = ledgers[0]._id;
        const entries = await LedgerEntry.find({ ledgerId });
        console.log(`Found ${entries.length} ledger entries for ${ledgers[0].name}`);
        entries.forEach(e => {
            console.log(`Date: ${e.date}, Voucher: ${e.voucherNo}, Type: ${e.type}, Amount: ${e.amount}, Narration: ${e.narration}`);
        });
        
        const invoices = await SalesInvoice.find({ customerName: { $regex: name, $options: 'i' } });
        console.log(`Found ${invoices.length} sales invoices for ${name}`);
        invoices.forEach(i => {
            console.log(`Invoice: ${i.invoiceNumber}, Date: ${i.invoiceDate}, CustomerId: ${i.customerId}, Status: ${i.status}, Total: ${i.grandTotal}`);
        });

        const vouchers = await Voucher.find({ partyId: ledgerId });
        console.log(`Found ${vouchers.length} vouchers for ${ledgers[0].name}`);
        vouchers.forEach(v => {
            console.log(`VoucherNo: ${v.voucherNo}, Date: ${v.date}, Nature: ${v.nature}, Total: ${v.totalAmount}`);
        });
    }
    
    await mongoose.disconnect();
}

checkLedger().catch(console.error);
