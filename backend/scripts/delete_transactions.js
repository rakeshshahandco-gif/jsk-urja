import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('MONGODB_URL not found in .env');
    process.exit(1);
}

// Define schemas (minimal for deletion)
const SalesOrder = mongoose.model('SalesOrder', new mongoose.Schema({}));
const SalesInvoice = mongoose.model('SalesInvoice', new mongoose.Schema({}));
const PurchaseOrder = mongoose.model('PurchaseOrder', new mongoose.Schema({}));
const PurchaseInvoice = mongoose.model('PurchaseInvoice', new mongoose.Schema({}));
const GRN = mongoose.model('GRN', new mongoose.Schema({}));
const StockLedger = mongoose.model('StockLedger', new mongoose.Schema({})); // Already cleared but let's be sure

async function deleteAll() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('Connected.');

        console.log('Deleting transactional records...');
        
        const soRes = await SalesOrder.deleteMany({});
        console.log(`Deleted ${soRes.deletedCount} sales orders.`);

        const siRes = await SalesInvoice.deleteMany({});
        console.log(`Deleted ${siRes.deletedCount} sales invoices.`);

        const poRes = await PurchaseOrder.deleteMany({});
        console.log(`Deleted ${poRes.deletedCount} purchase orders.`);

        const piRes = await PurchaseInvoice.deleteMany({});
        console.log(`Deleted ${piRes.deletedCount} purchase invoices.`);

        const grnRes = await GRN.deleteMany({});
        console.log(`Deleted ${grnRes.deletedCount} GRNs.`);

        const ledgerRes = await StockLedger.deleteMany({}); // Extra safety
        console.log(`Deleted ${ledgerRes.deletedCount} additional stock ledger entries.`);

        console.log('Transactional cleanup complete.');
    } catch (error) {
        console.error('Error during deletion:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

deleteAll();
