import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function runAudit() {
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        const collections = await db.listCollections().toArray();
        console.log(`\n--- Database Audit (${collections.length} Collections) ---`);

        for (const collInfo of collections) {
            const count = await db.collection(collInfo.name).countDocuments();
            if (count > 0) {
                console.log(`${collInfo.name.padEnd(30)}: ${count} records`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runAudit();
