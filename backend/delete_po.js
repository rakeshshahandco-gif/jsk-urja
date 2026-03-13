import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const run = async () => {
    try {
        const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URL or MONGODB_URI not found in env');
        await mongoose.connect(uri);
        const { PurchaseOrder } = await import('./src/models/purchaseOrder.model.js');

        const poRes = await PurchaseOrder.deleteMany({});
        console.log(`Deleted ${poRes.deletedCount} Purchase Orders.`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
