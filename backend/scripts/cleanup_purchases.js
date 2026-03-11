import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models (use relative paths from backend root or scripts dir)
const modelsDir = path.join(__dirname, '../src/models');
import { PurchaseOrder } from '../src/models/purchaseOrder.model.js';
import { PurchaseInvoice } from '../src/models/purchaseInvoice.model.js';
import { GRN } from '../src/models/grn.model.js';
import { PaymentEntry } from '../src/models/paymentEntry.model.js';
import { StockLedger } from '../src/models/stockLedger.model.js';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('🚀 Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const cleanup = async () => {
    try {
        await connectDB();
        console.log('✨ Starting Procurement Data Cleanup...');

        // 1. Purchase Orders
        const poCount = await PurchaseOrder.countDocuments();
        console.log(`🔍 Found ${poCount} Purchase Orders. Deleting...`);
        await PurchaseOrder.deleteMany({});
        console.log('✅ All Purchase Orders deleted.');

        // 2. Purchase Invoices
        const piCount = await PurchaseInvoice.countDocuments();
        console.log(`🔍 Found ${piCount} Purchase Invoices. Deleting...`);
        await PurchaseInvoice.deleteMany({});
        console.log('✅ All Purchase Invoices deleted.');

        // 3. GRNs
        const grnCount = await GRN.countDocuments();
        console.log(`🔍 Found ${grnCount} GRNs. Deleting...`);
        await GRN.deleteMany({});
        console.log('✅ All GRNs deleted.');

        // 4. Payment Entries
        const peCount = await PaymentEntry.countDocuments();
        console.log(`🔍 Found ${peCount} Payment Entries. Deleting...`);
        await PaymentEntry.deleteMany({});
        console.log('✅ All Payment Entries deleted.');

        // 5. Stock Ledger (Procurement related)
        const slCount = await StockLedger.countDocuments({
            transactionType: { $in: ['GRN', 'PURCHASE_INVOICE', 'PURCHASE_INVOICE_DELETE'] }
        });
        console.log(`🔍 Found ${slCount} Procurement Stock Ledger entries. Deleting...`);
        await StockLedger.deleteMany({
            transactionType: { $in: ['GRN', 'PURCHASE_INVOICE', 'PURCHASE_INVOICE_DELETE'] }
        });
        console.log('✅ Related Stock Ledger entries deleted.');

        console.log('🎉 Cleanup complete! All procurement data has been removed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
};

cleanup();
