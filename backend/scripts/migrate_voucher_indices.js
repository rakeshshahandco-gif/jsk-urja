import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const MONGO_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/jskurja-prod';

async function migrateIndices() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        
        // Remove old unique index on voucherNo
        try {
            await db.collection('vouchers').dropIndex('voucherNo_1');
            console.log('Successfully dropped unique index voucherNo_1');
        } catch (e) {
            console.log('Unique index voucherNo_1 not found or already dropped');
        }

        // Add new compound index
        try {
            await db.collection('vouchers').createIndex(
                { financialYear: 1, voucherType: 1, voucherNo: 1 },
                { unique: true, background: true }
            );
            console.log('Successfully created compound unique index');
        } catch (e) {
            console.error('Failed to create compound unique index (likely existing duplicates):', e.message);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrateIndices();
