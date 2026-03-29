import mongoose from 'mongoose';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { GRN } from '../models/grn.model.js';
import { reverseInvoiceLedgerImpact } from '../utils/ledgerDispatcher.js';
import { Item } from '../models/item.model.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const clearPurchases = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.\n');

        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
            // 1. Process Invoices (Accounting Reversal)
            const invoices = await PurchaseInvoice.find({}).session(session);
            console.log(`Found ${invoices.length} Purchase Invoices. Reversing impacts...`);
            
            for (const inv of invoices) {
                console.log(`- Reversing Ledger impact for: ${inv.invoiceNumber}`);
                await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
            }

            // 2. Clear Stock Ledger (Purchases and GRN)
            console.log('Clearing Stock Ledger entries for GRN and Purchase...');
            const stockResult = await StockLedger.deleteMany({
                transactionType: { $in: ['GRN', 'Purchase', 'PURCHASE_INVOICE'] }
            }).session(session);
            console.log(`- Deleted ${stockResult.deletedCount} Stock Ledger entries.`);

            // 3. Clear GRNs
            console.log('Clearing all GRN records...');
            const grnResult = await GRN.deleteMany({}).session(session);
            console.log(`- Deleted ${grnResult.deletedCount} GRNs.`);

            // 4. Delete Purchase Invoices
            console.log('Deleting all Purchase Invoices...');
            const piResult = await PurchaseInvoice.deleteMany({}).session(session);
            console.log(`- Deleted ${piResult.deletedCount} Purchase Invoices.`);

            // 5. Delete Purchase Orders
            console.log('Deleting all Purchase Orders...');
            const poResult = await PurchaseOrder.deleteMany({}).session(session);
            console.log(`- Deleted ${poResult.deletedCount} Purchase Orders.`);

            // 6. Final Stock Sync (Safety)
            console.log('\nRecalculating current stock for all items...');
            const items = await Item.find({}).session(session);
            for (const item of items) {
                const stockEntries = await StockLedger.find({ itemId: item._id }).session(session);
                const currentStock = stockEntries.reduce((sum, entry) => sum + (entry.inQty || 0) - (entry.outQty || 0), 0);
                
                // Also update stock value if possible, but keeping it simple for now
                item.currentStock = currentStock;
                await item.save({ session });
            }
            console.log(`- Recalculated stock for ${items.length} items.`);
        });

        console.log('\n✅ Purchase data cleanup completed successfully.');
        await session.endSession();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error during cleanup:', error);
        process.exit(1);
    }
};

clearPurchases();
