import mongoose from 'mongoose';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { Voucher } from '../src/models/voucher.model.js';

const url = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function repairNames() {
    await mongoose.connect(url);
    console.log('Connected for repair...');

    const sanitize = (name) => {
        if (!name) return '';
        // Remove anything in parentheses: "Company (Contact)" -> "Company"
        return name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    };

    // 1. Sales Invoices
    const invoices = await SalesInvoice.find({ customerName: /\(/ });
    console.log(`Found ${invoices.length} invoices to sanitize...`);
    for (const inv of invoices) {
        inv.customerName = sanitize(inv.customerName);
        await inv.save();
    }

    // 2. Sales Orders
    const orders = await SalesOrder.find({ customerName: /\(/ });
    console.log(`Found ${orders.length} orders to sanitize...`);
    for (const so of orders) {
        so.customerName = sanitize(so.customerName);
        await so.save();
    }

    // 3. Vouchers
    const vouchers = await Voucher.find({ partyName: /\(/ });
    console.log(`Found ${vouchers.length} vouchers to sanitize...`);
    for (const v of vouchers) {
        v.partyName = sanitize(v.partyName);
        await v.save();
    }

    console.log('Repair Complete.');
    process.exit(0);
}

repairNames().catch(err => {
    console.error(err);
    process.exit(1);
});
