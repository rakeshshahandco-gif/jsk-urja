import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Voucher } from '../models/voucher.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const run = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/crm_db');
        console.log('Connected.');

        // 1. Find all cancelled vouchers
        const cancelledVouchers = await Voucher.find({ status: 'Cancelled' }).select('_id voucherNo');
        console.log(`Found ${cancelledVouchers.length} cancelled vouchers.`);

        if (cancelledVouchers.length > 0) {
            const voucherIds = cancelledVouchers.map(v => v._id);
            
            // 2. Delete all LedgerEntries for these vouchers
            const deleteResult = await LedgerEntry.deleteMany({ voucherId: { $in: voucherIds } });
            
            console.log(`Deleted ${deleteResult.deletedCount} orphaned ledger entries from already cancelled vouchers.`);
        }

        console.log('Cleanup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

run();
