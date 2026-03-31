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
    console.log('🚀 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected.');

        const db = mongoose.connection.db;

        console.log('\n--- Checking GST Import Logs ---');
        const logs = await db.collection('gstimportlogs').find().sort({ createdAt: -1 }).limit(10).toArray();
        if (logs.length === 0) {
            console.log('No GST import logs found.');
            process.exit(0);
        }

        const gstMap = new Map(); // Map companyName -> GST

        logs.forEach(log => {
            console.log(`Log Found: ${log.fileName} (${log.createdAt})`);
            if (log.updates && log.updates.length > 0) {
                log.updates.forEach(u => {
                    const name = (u.companyName || '').toLowerCase().trim();
                    if (name && u.newGst) {
                        gstMap.set(name, {
                            gstNumber: u.newGst,
                            source: 'Log Update'
                        });
                    }
                });
            }
            if (log.skipped && log.skipped.length > 0) {
                 log.skipped.forEach(s => {
                    const name = (s.companyName || '').toLowerCase().trim();
                    if (name && s.excelGst) {
                        gstMap.set(name, {
                            gstNumber: s.excelGst,
                            source: 'Log Skipped'
                        });
                    }
                 });
            }
        });

        console.log(`📊 Found ${gstMap.size} unique GST numbers in logs.`);

        if (gstMap.size > 0) {
            // Check matches in active customers
            const activeMissingGst = await db.collection('customers').find({
                isDeleted: { $ne: true },
                $or: [
                    { gstNumber: { $exists: false } },
                    { gstNumber: '' },
                    { gstNumber: null }
                ]
            }).toArray();

            let matches = 0;
            activeMissingGst.forEach(active => {
                const name = (active.company || active.customerName || '').toLowerCase().trim();
                if (gstMap.has(name)) {
                    matches++;
                    if (matches <= 5) {
                        console.log(`Possible Match: ${active.company || active.customerName} -> ${gstMap.get(name).gstNumber}`);
                    }
                }
            });

            console.log(`\n✅ Found ${matches} possible matches in logs for the currently missing active records.`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
