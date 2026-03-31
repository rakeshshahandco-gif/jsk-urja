import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Note: Running from backend/ directory
dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in .env');
    process.exit(1);
}

async function run() {
    console.log('🚀 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URL, {
            serverSelectionTimeoutMS: 30000,
        });
        console.log('✅ Connected.');

        const db = mongoose.connection.db;
        const coll = db.collection('customers');

        console.log('🔍 Auditing customers...');
        const total = await coll.countDocuments({});
        const deleted = await coll.countDocuments({ isDeleted: true });
        
        console.log(`📊 Stats: Total=${total}, Deleted=${deleted}`);

        if (deleted > 0) {
            console.log(`🛠️ Restoring ${deleted} customers...`);
            const result = await coll.updateMany(
                { isDeleted: true },
                { $set: { isDeleted: false, status: 'running_high' } }
            );
            console.log(`✅ Success! Restored ${result.modifiedCount} records.`);
        } else {
            console.log('ℹ️ No deleted customers found to restore.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
