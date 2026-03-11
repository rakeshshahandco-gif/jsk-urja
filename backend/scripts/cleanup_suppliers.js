import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models
import { Supplier } from '../src/models/supplier.model.js';
import { AccountLedger } from '../src/models/accountLedger.model.js';

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
        console.log('✨ Starting Supplier Master Cleanup...');

        // 1. Supplier Records
        const supplierCount = await Supplier.countDocuments();
        console.log(`🔍 Found ${supplierCount} Suppliers. Deleting...`);
        await Supplier.deleteMany({});
        console.log('✅ All Supplier records deleted.');

        // 2. Account Ledgers (Supplier related)
        const ledgerCount = await AccountLedger.countDocuments({ type: 'Supplier' });
        console.log(`🔍 Found ${ledgerCount} Supplier Account Ledgers. Deleting...`);
        await AccountLedger.deleteMany({ type: 'Supplier' });
        console.log('✅ Related Account Ledger entries deleted.');

        console.log('🎉 Cleanup complete! All supplier data has been removed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
};

cleanup();
