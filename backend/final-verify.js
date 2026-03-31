import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const db = mongoose.connection.db;

        console.log('\n--- Final Verification ---');
        const activeCount = await db.collection('customers').countDocuments({ isDeleted: { $ne: true } });
        console.log(`Final Active Customers: ${activeCount}`);

        const withGst = await db.collection('customers').find({
            isDeleted: { $ne: true },
            gstNumber: { $exists: true, $ne: '' }
        }).toArray();

        console.log(`Active with GST: ${withGst.length}`);

        console.log('\n--- Sample Restored Master Records ---');
        withGst.slice(0, 10).forEach(r => {
            console.log(`ID: ${r._id} | Company: ${r.company} | GST: ${r.gstNumber} | Code: ${r.customerCode}`);
        });

        // Check for any remaining CUST- codes in company field
        const remainingCorrupted = await db.collection('customers').countDocuments({
            isDeleted: { $ne: true },
            company: /^CUST-/
        });
        console.log(`\nRemaining active records with CUST- codes: ${remainingCorrupted}`);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

verify();
