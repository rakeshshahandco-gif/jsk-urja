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

        const code = 'CUST-2022-00023';
        console.log(`\n--- Global Search for Code: ${code} ---`);

        const collections = await db.listCollections().toArray();
        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments({
                $or: [
                    { company: code },
                    { customerCode: code },
                    { supplierCode: code },
                    { name: code },
                    { description: { $regex: code } }
                ]
            });
            if (count > 0) {
                console.log(`Found ${count} matches in collection: ${coll.name}`);
                const sample = await db.collection(coll.name).findOne({
                    $or: [
                        { company: code },
                        { customerCode: code },
                        { supplierCode: code },
                        { name: code },
                        { description: { $regex: code } }
                    ]
                });
                console.log(`Sample:`, JSON.stringify(sample, null, 2));
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
