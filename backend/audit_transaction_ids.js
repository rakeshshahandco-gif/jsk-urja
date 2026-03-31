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

        console.log('\n--- Auditing Transaction Customer IDs ---');
        
        const collections = ['salesorders', 'salesinvoices', 'tasks', 'reminders', 'followups', 'conversations'];
        const allCustomerIds = new Set();

        for (const coll of collections) {
            const ids = await db.collection(coll).distinct('customerId');
            console.log(`Collection: ${coll}, Unique Customer IDs: ${ids.length}`);
            ids.forEach(id => {
                if (id) allCustomerIds.add(id.toString());
            });
        }

        console.log(`\nGrand Total Unique Customer IDs in all transactions: ${allCustomerIds.size}`);

        // --- Cross Reference with Customers Collection ---
        const existingIds = (await db.collection('customers').find({}, { projection: { _id: 1 } }).toArray()).map(c => c._id.toString());
        const existingIdsSet = new Set(existingIds);

        const danglingIds = [];
        allCustomerIds.forEach(id => {
            if (!existingIdsSet.has(id)) {
                danglingIds.push(id)
            }
        });

        console.log(`Total Dangling IDs (in transactions but NOT in customers collection): ${danglingIds.length}`);

        if (danglingIds.length > 0) {
            console.log(`Sample Dangling IDs: ${danglingIds.slice(0, 5).join(', ')}`);
        }

        // --- Check for 650 ---
        if (allCustomerIds.size >= 650) {
            console.log('✅ Found at least 650 unique customer references in transactions!');
        } else {
             console.log(`Total unique IDs found: ${allCustomerIds.size}. Still searching for the 650...`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
