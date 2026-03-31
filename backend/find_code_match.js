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

        // 1. Get a sample code from the corrupted records
        const corrupted = await db.collection('customers').findOne({ company: /^CUST-/ });
        if (!corrupted) {
            console.log('No corrupted records found.');
            process.exit(0);
        }

        const code = corrupted.company;
        console.log(`Found corrupted record with code: ${code}`);

        // 2. Search for ANY record (active or deleted) that has this as its customerCode
        const match = await db.collection('customers').findOne({ customerCode: code });
        if (match) {
            console.log('--- Found Match by customerCode ---');
            console.log(`ID: ${match._id}`);
            console.log(`Company: ${match.company}`);
            console.log(`Customer Name: ${match.customerName}`);
            console.log(`GST: ${match.gstNumber}`);
            console.log(`Deleted: ${match.isDeleted}`);
        } else {
            console.log(`No record found with customerCode: ${code}`);
        }

        // 3. Search for any record that has this code ANYWHERE else
        const textMatch = await db.collection('customers').findOne({ $text: { $search: code } });
        if (textMatch) {
            console.log('--- Found Match by Text Search ---');
            console.log(`ID: ${textMatch._id}`);
            console.log(`Company: ${textMatch.company}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
