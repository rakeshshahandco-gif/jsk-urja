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

        const record = await db.collection('customers').findOne({
            gstNumber: { $exists: true, $ne: '' }
        });

        if (record) {
            console.log('--- Inspecting Record ---');
            console.log(`ID: ${record._id}`);
            console.log(`Company: ${record.company}`);
            console.log(`Customer Name: ${record.customerName}`);
            console.log('Contact Persons:', JSON.stringify(record.contactPersons, null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
