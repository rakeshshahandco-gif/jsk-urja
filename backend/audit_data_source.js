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

        console.log('\n--- Auditing Customer Records ---');
        const activeCount = await db.collection('customers').countDocuments({ isDeleted: { $ne: true } });
        const deletedCount = await db.collection('customers').countDocuments({ isDeleted: true });
        console.log(`Active: ${activeCount}, Deleted: ${deletedCount}`);

        console.log('\n--- Searching for Correct Names/GST (isDeleted might be true?) ---');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2);

        // Find all records updated Mar 30 - 31
        const recentUpdates = await db.collection('customers').find({
            updatedAt: { $gte: yesterday }
        }).toArray();

        console.log(`Total records updated in 48h: ${recentUpdates.length}`);

        const withGstCount = recentUpdates.filter(r => r.gstNumber && r.gstNumber.trim().length > 0).length;
        const withRealNameCount = recentRecordsWithName(recentUpdates);
        
        console.log(`Updated with GST: ${withGstCount}`);
        console.log(`Updated with Name (not code): ${withRealNameCount}`);

        const deletedWithGst = await db.collection('customers').find({
            isDeleted: true,
            gstNumber: { $exists: true, $ne: '' }
        }).toArray();
        console.log(`Deleted records with GST: ${deletedWithGst.length}`);

        // --- Check Links ---
        console.log('\n--- Auditing Transaction Links ---');
        const totalSalesOrders = await db.collection('salesorders').countDocuments({});
        const totalTasks = await db.collection('tasks').countDocuments({});
        const totalReminders = await db.collection('reminders').countDocuments({});
        const totalFollowups = await db.collection('followups').countDocuments({});
        
        console.log(`Sales Orders: ${totalSalesOrders}, Tasks: ${totalTasks}, Reminders: ${totalReminders}, Followups: ${totalFollowups}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

function recentRecordsWithName(records) {
    return records.filter(r => {
        const name = r.company || r.customerName || '';
        // If it starts with CUST-, it's likely a code, not a name
        return name && !name.startsWith('CUST-');
    }).length;
}

run();
