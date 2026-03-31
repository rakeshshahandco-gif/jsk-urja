import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

// Collections to re-link
const RELATED_COLLECTIONS = [
    { name: 'salesinvoices', field: 'customerId' },
    { name: 'salesorders', field: 'customerId' },
    { name: 'tasks', field: 'customerId' },
    { name: 'reminders', field: 'customerId' },
    { name: 'followups', field: 'customerId' },
    { name: 'conversations', field: 'customerId' }
];

async function runRestore() {
    try {
        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;
        console.log('✅ Connected.');

        // --- PHASE 1: RESTORE NAMES FROM CONTACTS ---
        console.log('\n--- Phase 1: Restoring Names from Contact Persons ---');
        const corrupted = await db.collection('customers').find({
            company: /^CUST-/
        }).toArray();

        console.log(`🔍 Found ${corrupted.length} records with CUST- codes.`);

        let nameRestoredCount = 0;
        for (const record of corrupted) {
            const contactName = record.contactPersons?.[0]?.name;
            // Basic sanity check: ensure name is not just a number
            if (contactName && !/^\d+$/.test(contactName.trim())) {
                await db.collection('customers').updateOne(
                    { _id: record._id },
                    { $set: { company: contactName.trim() } }
                );
                nameRestoredCount++;
            }
        }
        console.log(`✅ Successfully restored names for ${nameRestoredCount} records.`);

        // --- PHASE 2: DEDUPLICATION AND MERGING ---
        console.log('\n--- Phase 2: Deduplication and Merging ---');
        
        const allRecords = await db.collection('customers').find({ isDeleted: { $ne: true } }).toArray();
        const groupedByName = new Map();

        allRecords.forEach(r => {
            const name = (r.company || r.customerName || '').toLowerCase().trim();
            if (!name) return;
            if (!groupedByName.has(name)) groupedByName.set(name, []);
            groupedByName.get(name).push(r);
        });

        console.log(`📊 Unique companies: ${groupedByName.size}`);

        let mergeCount = 0;
        let documentRelinkedCount = 0;

        for (const [name, duplicates] of groupedByName) {
            if (duplicates.length > 1) {
                // Determine the "Master" record: 
                // Prioritize one with GST, then the one with most contacts or older creation date
                duplicates.sort((a, b) => {
                    if (a.gstNumber && !b.gstNumber) return -1;
                    if (b.gstNumber && !a.gstNumber) return 1;
                    return new Date(a.createdAt) - new Date(b.createdAt);
                });

                const master = duplicates[0];
                const others = duplicates.slice(1);

                console.log(`🔄 Merging ${others.length} duplicates into Master: "${master.company}" (${master._id})`);

                for (const dupe of others) {
                    // Update all related documents to the Master ID
                    for (const collInfo of RELATED_COLLECTIONS) {
                        const result = await db.collection(collInfo.name).updateMany(
                            { [collInfo.field]: dupe._id },
                            { $set: { [collInfo.field]: master._id } }
                        );
                        documentRelinkedCount += result.modifiedCount;
                    }

                    // Soft Delete the duplicate
                    await db.collection('customers').updateOne(
                        { _id: dupe._id },
                        { $set: { isDeleted: true, status: 'inactive', notes: `Merged into ${master._id} on ${new Date().toISOString()}` } }
                    );
                }
                mergeCount++;
            }
        }

        console.log(`\n✅ Deduplication Complete!`);
        console.log(`🔗 Total Merged sets: ${mergeCount}`);
        console.log(`📝 Total Documents re-linked: ${documentRelinkedCount}`);

        // --- FINAL COUNT ---
        const finalActive = await db.collection('customers').countDocuments({ isDeleted: { $ne: true } });
        console.log(`\n--- Final Stats ---`);
        console.log(`Active Customers: ${finalActive}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ FATAL ERROR DURING RESTORATION:', error);
        process.exit(1);
    }
}

runRestore();
