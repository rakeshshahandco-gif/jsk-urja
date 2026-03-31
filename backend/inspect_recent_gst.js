import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function run() {
    console.log('🚀 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected.');

        const db = mongoose.connection.db;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2); 

        console.log('\n--- Inspecting Recently Updated Customers (Mar 30) ---');
        const recentRecords = await db.collection('customers').find({
            gstNumber: { $exists: true, $ne: '' },
            updatedAt: { $gte: yesterday }
        }).sort({ updatedAt: -1 }).limit(5).toArray();

        if (recentRecords.length > 0) {
            recentRecords.forEach((r, i) => {
                console.log(`Record ${i+1}: ID=${r._id} | GST=${r.gstNumber} | UpdatedAt=${r.updatedAt}`);
                console.log(`Available Fields: ${Object.keys(r).join(', ')}`);
                console.log(`Values: company="${r.company}", customerName="${r.customerName}", name="${r.name}"`);
                console.log('-------------------');
            });
        } else {
            console.log('No recent records found with GST.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
