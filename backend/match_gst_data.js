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

        // 1. Get all active customers missing GST
        const activeMissingGst = await db.collection('customers').find({
            isDeleted: { $ne: true },
            $or: [
                { gstNumber: { $exists: false } },
                { gstNumber: '' },
                { gstNumber: null }
            ]
        }).toArray();

        console.log(`📊 Found ${activeMissingGst.length} active customers missing GST numbers.`);

        // 2. Get all deleted customers WITH GST
        const deletedWithGst = await db.collection('customers').find({
            isDeleted: true,
            gstNumber: { $exists: true, $ne: '' }
        }).toArray();

        console.log(`📊 Found ${deletedWithGst.length} deleted customers with GST numbers.`);

        // 3. Try to match by company name or customerName
        const matches = [];

        activeMissingGst.forEach(active => {
            const activeName = (active.company || active.customerName || '').toLowerCase().trim();
            if (!activeName) return;

            const match = deletedWithGst.find(del => {
                const delName = (del.company || del.customerName || '').toLowerCase().trim();
                return delName === activeName;
            });

            if (match) {
                matches.push({
                    activeId: active._id,
                    activeName: active.company || active.customerName,
                    deletedId: match._id,
                    gstNumber: match.gstNumber,
                    gstType: match.gstType,
                    gstRegistrationType: match.gstRegistrationType
                });
            }
        });

        console.log(`\n✅ Found ${matches.length} matches where a deleted record has the GST for an active record.`);
        
        if (matches.length > 0) {
            console.log('\n--- Match Preview ---');
            matches.slice(0, 10).forEach(m => {
                console.log(`Match: ${m.activeName} -> GST: ${m.gstNumber}`);
            });
            if (matches.length > 10) console.log(`... and ${matches.length - 10} more.`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
