
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        
        console.log('Searching for names starting with #...');

        for (const colInfo of collections) {
            const colName = colInfo.name;
            const collection = db.collection(colName);
            
            // Search all string fields for values starting with #
            // We'll use a broad approach: find any document that has AT LEAST ONE field matching /^#/
            // Since we don't know the schema for every collection, we'll check common name fields or just search all strings
            
            const matches = await collection.find({
                $or: [
                    { company: /^#/ },
                    { customerName: /^#/ },
                    { supplierName: /^#/ },
                    { name: /^#/ },
                    { ledgerName: /^#/ },
                    { partyName: /^#/ },
                    { 'items.ledgerName': /^#/ }
                ]
            }).toArray();

            if (matches.length > 0) {
                console.log(`\n--- Matches in [${colName}] ---`);
                matches.forEach(m => {
                    console.log(`ID: ${m._id}`);
                    if (m.company) console.log(`  company: ${m.company}`);
                    if (m.customerName) console.log(`  customerName: ${m.customerName}`);
                    if (m.supplierName) console.log(`  supplierName: ${m.supplierName}`);
                    if (m.name) console.log(`  name: ${m.name}`);
                    if (m.ledgerName) console.log(`  ledgerName: ${m.ledgerName}`);
                    if (m.partyName) console.log(`  partyName: ${m.partyName}`);
                });
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();
