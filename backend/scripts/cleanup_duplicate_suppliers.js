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

const cleanupDuplicates = async () => {
    try {
        await connectDB();
        console.log('✨ Starting Duplicate Supplier Cleanup...');

        // 1. Group suppliers by name
        const suppliers = await Supplier.find({}).sort({ createdAt: 1 });
        const nameMap = {};
        const toDeleteIds = [];

        for (const s of suppliers) {
            const nameKey = s.supplierName.trim().toLowerCase();
            if (nameMap[nameKey]) {
                // Already exists, mark this one for deletion
                toDeleteIds.push(s._id);
            } else {
                // First time encounter, keep it
                nameMap[nameKey] = s;
            }
        }

        if (toDeleteIds.length === 0) {
            console.log('✅ No duplicates found.');
        } else {
            console.log(`🔍 Found ${toDeleteIds.length} duplicate supplier records. Deleting...`);
            await Supplier.deleteMany({ _id: { $in: toDeleteIds } });
            console.log('✅ Duplicate suppliers deleted.');

            // 2. Clean up associated Account Ledgers
            // We should also look for duplicate ledgers by name
            const ledgers = await AccountLedger.find({ type: 'Supplier' }).sort({ createdAt: 1 });
            const ledgerNameMap = {};
            const toDeleteLedgerIds = [];

            for (const l of ledgers) {
                const nameKey = l.name.trim().toLowerCase();
                if (ledgerNameMap[nameKey]) {
                    toDeleteLedgerIds.push(l._id);
                } else {
                    ledgerNameMap[nameKey] = l;
                }
            }

            if (toDeleteLedgerIds.length > 0) {
                console.log(`🔍 Found ${toDeleteLedgerIds.length} duplicate account ledgers. Deleting...`);
                await AccountLedger.deleteMany({ _id: { $in: toDeleteLedgerIds } });
                console.log('✅ Duplicate account ledgers deleted.');
            }
        }

        console.log('🎉 Cleanup complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
};

cleanupDuplicates();
