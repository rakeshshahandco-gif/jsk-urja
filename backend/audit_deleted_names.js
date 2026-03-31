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
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        console.log('\n--- Auditing Deleted Customers for Real Names ---');
        const deletedRecords = await db.collection('customers').find({ isDeleted: true }).toArray();
        
        console.log(`Total Deleted: ${deletedRecords.length}`);

        const withRealName = deletedRecords.filter(r => {
            const name = r.company || r.customerName || '';
            return name && !name.startsWith('CUST-');
        });

        console.log(`Deleted with Real Names (not codes): ${withRealName.length}`);

        if (withRealName.length > 0) {
            console.log('\n--- Sample Deleted Real Names ---');
            withRealName.slice(0, 10).forEach(r => {
                console.log(`ID: ${r._id} | Company: ${r.company} | Name: ${r.customerName} | GST: ${r.gstNumber}`);
            });
        }

        // --- Check for 650 total ---
        const activeWithRealName = await db.collection('customers').find({ 
            isDeleted: { $ne: true },
            company: { $not: /^CUST-/ }
        }).count();
        
        console.log(`\nActive with Real Names: ${activeWithRealName}`);
        console.log(`Grand Total Potential Real Names: ${withRealName.length + activeWithRealName}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
