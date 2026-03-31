import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in .env');
    process.exit(1);
}

async function run() {
    console.log('🚀 Connecting to MongoDB for Duplicate Audit...');
    try {
        await mongoose.connect(MONGODB_URL, {
            serverSelectionTimeoutMS: 30000,
        });
        console.log('✅ Connected.');

        const db = mongoose.connection.db;
        const coll = db.collection('customers');

        console.log('🔍 Identifying duplicates by Name + GST (Active records only)...');
        
        // 1. Find duplicates by Customer Name
        const nameGroups = await coll.aggregate([
            { $match: { isDeleted: false, customerName: { $exists: true, $ne: '' } } },
            { $group: { 
                _id: '$customerName', 
                count: { $sum: 1 }, 
                ids: { $push: '$_id' },
                gsts: { $addToSet: '$gstNumber' },
                updatedAts: { $push: '$updatedAt' }
            } },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();

        // 2. Find duplicates by GST Number
        const gstGroups = await coll.aggregate([
            { $match: { isDeleted: false, gstNumber: { $exists: true, $ne: '' } } },
            { $group: { 
                _id: '$gstNumber', 
                count: { $sum: 1 }, 
                ids: { $push: '$_id' },
                names: { $addToSet: '$customerName' }
            } },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();

        console.log('\n--- AUDIT SUMMARY ---');
        console.log(`- Duplicate Groups (by Name): ${nameGroups.length}`);
        console.log(`- Duplicate Groups (by GST):  ${gstGroups.length}`);

        if (nameGroups.length > 0) {
            console.log('\nTop 5 Duplicate Names:');
            nameGroups.slice(0, 5).forEach(g => {
                console.log(`  - "${g._id}": ${g.count} records [IDs: ${g.ids.slice(0, 2).join(', ')}...]`);
            });
        }

        if (gstGroups.length > 0) {
            console.log('\nDuplicate GST Groups (indicating identical entities):');
            gstGroups.slice(0, 5).forEach(g => {
                console.log(`  - "${g._id}": ${g.count} records [Names: ${g.names.join(', ')}]`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error during audit:', error.message);
        process.exit(1);
    }
}

run();
