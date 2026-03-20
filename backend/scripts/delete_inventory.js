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
const Item = mongoose.model('Item', new mongoose.Schema({}));
const ItemGroup = mongoose.model('ItemGroup', new mongoose.Schema({}));
const ItemType = mongoose.model('ItemType', new mongoose.Schema({}));
const BOM = mongoose.model('BOM', new mongoose.Schema({}));
const StockLedger = mongoose.model('StockLedger', new mongoose.Schema({}));

async function deleteAll() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('Connected.');

        console.log('Deleting records...');
        
        const itemRes = await Item.deleteMany({});
        console.log(`Deleted ${itemRes.deletedCount} items.`);

        const groupRes = await ItemGroup.deleteMany({});
        console.log(`Deleted ${groupRes.deletedCount} item groups.`);

        const typeRes = await ItemType.deleteMany({});
        console.log(`Deleted ${typeRes.deletedCount} item types.`);

        const bomRes = await BOM.deleteMany({});
        console.log(`Deleted ${bomRes.deletedCount} BOMs.`);

        const ledgerRes = await StockLedger.deleteMany({});
        console.log(`Deleted ${ledgerRes.deletedCount} stock ledger entries.`);

        console.log('Cleanup complete.');
    } catch (error) {
        console.error('Error during deletion:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

deleteAll();
