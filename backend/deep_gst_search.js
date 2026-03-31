import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

async function runSearch() {
    try {
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;

        console.log('--- Deep GST Search in Customers Collection ---');
        const allCustomers = await db.collection('customers').find({}).toArray();
        console.log(`Scanning ${allCustomers.length} total records...`);

        const foundMap = new Map(); // id -> { field, value, company }

        allCustomers.forEach(doc => {
            const scan = (obj, path = '') => {
                for (const key in obj) {
                    const currentPath = path ? `${path}.${key}` : key;
                    const val = obj[key];
                    if (typeof val === 'string') {
                        const cleanVal = val.trim().toUpperCase().replace(/\s+/g, '');
                        if (gstRegex.test(cleanVal)) {
                            if (!foundMap.has(doc._id.toString())) {
                                foundMap.set(doc._id.toString(), []);
                            }
                            foundMap.get(doc._id.toString()).push({ path: currentPath, value: val, company: doc.company, isDeleted: doc.isDeleted });
                        }
                    } else if (typeof val === 'object' && val !== null) {
                        scan(val, currentPath);
                    }
                }
            };
            scan(doc);
        });

        console.log(`✅ Found GST-like strings in ${foundMap.size} unique records.`);

        let count = 0;
        for (const [id, matches] of foundMap) {
            matches.forEach(m => {
                if (m.path !== 'gstNumber') {
                    console.log(`HIDDEN GST! ID: ${id} | Path: ${m.path} | Value: ${m.value} | Co: ${m.company} | Deleted: ${m.isDeleted}`);
                } else {
                    // console.log(`Normal GST: ${m.company} (${id})`);
                }
            });
            count++;
        }

        const stats = {
            activeWithGst: 0,
            deletedWithGst: 0
        };

        for (const [id, matches] of foundMap) {
            const isDeleted = matches[0].isDeleted;
            if (isDeleted) stats.deletedWithGst++;
            else stats.activeWithGst++;
        }

        console.log('\n--- Stats ---');
        console.log(`Active with any GST string: ${stats.activeWithGst}`);
        console.log(`Deleted with any GST string: ${stats.deletedWithGst}`);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runSearch();
