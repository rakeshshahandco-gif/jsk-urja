import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function run() {
    console.log('🚀 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URL, {
            serverSelectionTimeoutMS: 30000,
        });
        console.log('✅ Connected to MongoDB.');

        const db = mongoose.connection.db;
        const coll = db.collection('customers');

        // ── AUDIT CURRENT STATE ──
        const totalDocs = await coll.countDocuments({});
        const deletedDocs = await coll.countDocuments({ isDeleted: true });
        const activeDocs = await coll.countDocuments({ isDeleted: { $ne: true } });

        console.log('\n📊 Current Customer Stats:');
        console.log(`   Total documents  : ${totalDocs}`);
        console.log(`   Active (visible) : ${activeDocs}`);
        console.log(`   Soft-deleted     : ${deletedDocs}`);

        if (deletedDocs > 0) {
            console.log(`\n🛠️  Restoring ${deletedDocs} soft-deleted customers...`);
            const result = await coll.updateMany(
                { isDeleted: true },
                {
                    $set: {
                        isDeleted: false,
                        restoredAt: new Date(),
                        restoredReason: 'Manual restore after accidental soft-delete during GST import'
                    }
                }
            );
            console.log(`✅ Restored ${result.modifiedCount} customer records.`);

            // Verify after restore
            const afterActive = await coll.countDocuments({ isDeleted: { $ne: true } });
            console.log(`\n📊 After Restore - Active customers: ${afterActive}`);
        } else {
            console.log('\nℹ️  No soft-deleted customers found. Checking for other issues...');

            // List a sample of customers to verify data
            const sample = await coll.find({}).limit(5).toArray();
            console.log('\n📋 Sample customer records:');
            sample.forEach((c, i) => {
                console.log(`  ${i + 1}. ${c.customerName || c.company || '(no name)'} | isDeleted: ${c.isDeleted} | status: ${c.status}`);
            });
        }

        await mongoose.disconnect();
        console.log('\n✅ Done. Database connection closed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
