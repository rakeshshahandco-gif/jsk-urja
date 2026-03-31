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
    console.log('🚀 Connecting to MongoDB for Deduplication...');
    try {
        await mongoose.connect(MONGODB_URL, {
            serverSelectionTimeoutMS: 30000,
        });
        const coll = mongoose.connection.db.collection('customers');

        // 1. Identify groups with same name or same GST (Active only)
        const groups = await coll.aggregate([
            { $match: { isDeleted: false } },
            { $group: { 
                _id: '$customerName', 
                count: { $sum: 1 }, 
                records: { $push: { id: '$_id', updatedAt: '$updatedAt', gst: '$gstNumber' } } 
            } },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();

        console.log(`📊 Found ${groups.length} duplicate name groups.`);

        let totalHidden = 0;

        for (const group of groups) {
            // Sort by most recently updated
            const sorted = group.records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            // Keep the first (most recent)
            const keepId = sorted[0].id;
            // Hide the others
            const hideIds = sorted.slice(1).map(r => r.id);

            console.log(`🛠️ Group "${group._id}": Keeping ${keepId}, hiding ${hideIds.length} records.`);
            
            const result = await coll.updateMany(
                { _id: { $in: hideIds } },
                { $set: { isDeleted: true, status: 'inactive' } }
            );
            totalHidden += result.modifiedCount;
        }

        // 2. Identify groups with same GST (Active only, in case names differ)
        const gstGroups = await coll.aggregate([
            { $match: { isDeleted: false, gstNumber: { $exists: true, $ne: '' } } },
            { $group: { 
                _id: '$gstNumber', 
                count: { $sum: 1 }, 
                records: { $push: { id: '$_id', updatedAt: '$updatedAt' } } 
            } },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();

        console.log(`📊 Found ${gstGroups.length} duplicate GST groups.`);

        for (const group of gstGroups) {
            const sorted = group.records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            const keepId = sorted[0].id;
            const hideIds = sorted.slice(1).map(r => r.id);

            console.log(`🛠️ GST "${group._id}": Keeping ${keepId}, hiding ${hideIds.length} records.`);
            
            const result = await coll.updateMany(
                { _id: { $in: hideIds } },
                { $set: { isDeleted: true, status: 'inactive' } }
            );
            totalHidden += result.modifiedCount;
        }

        console.log(`✅ Success! Total redundant records hidden: ${totalHidden}`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during deduplication:', error.message);
        process.exit(1);
    }
}

run();
