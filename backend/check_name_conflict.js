import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function runCheck() {
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        console.log('\n--- Checking for Name vs Contact Name Conflict ---');
        const active = await db.collection('customers').find({
             isDeleted: { $ne: true }
        }).limit(10).toArray();

        active.forEach(r => {
            const contactName = r.contactPersons?.[0]?.name;
            const companyName = r.company;
            const isSame = (contactName === companyName);
            console.log(`ID: ${r._id} | Co: ${companyName.padEnd(30)} | Contact: ${contactName.padEnd(30)} | Conflict: ${isSame}`);
        });

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runCheck();
