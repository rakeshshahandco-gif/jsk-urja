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

        console.log('\n--- Auditing Transaction ID Sources ---');
        
        const collections = ['salesorders', 'salesinvoices', 'tasks', 'reminders', 'followups', 'conversations'];
        const allCustomerIds = new Set();
        for (const coll of collections) {
            const ids = await db.collection(coll).distinct('customerId');
            ids.forEach(id => { if (id) allCustomerIds.add(id.toString()); });
        }

        const idsArray = Array.from(allCustomerIds).map(id => new mongoose.Types.ObjectId(id));

        const customersWithTransactions = await db.collection('customers').find({
            _id: { $in: idsArray }
        }).toArray();

        console.log(`Unique IDs in Transactions: ${allCustomerIds.size}`);
        console.log(`Matching records in Customers collection: ${customersWithTransactions.length}`);

        const corruptedCount = customersWithTransactions.filter(c => (c.company || '').startsWith('CUST-')).length;
        const namedCount = customersWithTransactions.filter(c => c.company && !c.company.startsWith('CUST-')).length;
        const deletedCount = customersWithTransactions.filter(c => c.isDeleted === true).length;

        console.log(`Corrupted (code name): ${corruptedCount}`);
        console.log(`Named (real name): ${namedCount}`);
        console.log(`Deleted: ${deletedCount}`);

        if (corruptedCount > 0) {
            console.log('\n--- Sample Corrupted Record with Transactions ---');
            const sample = customersWithTransactions.find(c => (c.company || '').startsWith('CUST-'));
            console.log(`ID: ${sample._id} | Company: ${sample.company} | GST: ${sample.gstNumber}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
