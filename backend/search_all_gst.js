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

        console.log('\n--- Searching for any record with GST (Active or Deleted) ---');
        const withGst = await db.collection('customers').find({
            gstNumber: { $exists: true, $ne: '' }
        }).toArray();

        console.log(`Found ${withGst.length} records with non-empty GST number.`);

        const activeWithGst = withGst.filter(r => r.isDeleted !== true);
        const deletedWithGst = withGst.filter(r => r.isDeleted === true);

        console.log(`Active with GST: ${activeWithGst.length}`);
        console.log(`Deleted with GST: ${deletedWithGst.length}`);

        // --- Sampling ---
        console.log('\n--- Sample Records with GST ---');
        withGst.slice(0, 10).forEach(r => {
            console.log(`ID: ${r._id} | Company: ${r.company} | CustName: ${r.customerName} | GST: ${r.gstNumber} | Deleted: ${r.isDeleted}`);
        });

        // --- Check for "CUST-" names in GST records ---
        const codesInGst = withGst.filter(r => (r.company || '').startsWith('CUST-')).length;
        console.log(`\nGST records having "CUST-" codes as name: ${codesInGst}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
