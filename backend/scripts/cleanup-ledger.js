import mongoose from 'mongoose';
import { StockLedger } from '../src/models/stockLedger.model.js';
import { Item } from '../src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function recalculate(itemId) {
    const item = await Item.findById(itemId);
    if (!item) return;
    const entries = await StockLedger.find({ itemId }).sort({ date: 1, createdAt: 1 });
    let bal = item.openingStock || 0;
    for (const e of entries) {
        bal += (e.inQty || 0) - (e.outQty || 0);
        e.runningStock = bal;
        await e.save();
    }
    item.currentStock = bal;
    await item.save();
    console.log(`Recalculated ${item.itemCode}: Current Stock = ${bal}`);
}

async function cleanup() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to DB');

    const typesToRemove = [
        'PURCHASE_INVOICE_DELETE',
        'SALES_INVOICE_CANCEL',
        'SALES_INVOICE_RESTORE',
        'GRN_DELETE'
    ];

    const affectedItems = await StockLedger.distinct('itemId', { 
        transactionType: { $in: typesToRemove } 
    });

    console.log(`Found ${affectedItems.length} items with reversal entries.`);

    const result = await StockLedger.deleteMany({ 
        transactionType: { $in: typesToRemove } 
    });

    console.log(`Deleted ${result.deletedCount} reversal entries.`);

    for (const itemId of affectedItems) {
        await recalculate(itemId);
    }

    console.log('Cleanup complete.');
    process.exit(0);
}

cleanup().catch(err => {
    console.error(err);
    process.exit(1);
});
