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

        console.log('\n--- Auditing Deleted Customers for customerCode ---');
        const deletedWithCodes = await db.collection('customers').find({
            isDeleted: true,
            customerCode: { $exists: true, $ne: '' }
        }).toArray();

        console.log(`Found ${deletedWithCodes.length} deleted customers with customerCode values.`);

        if (deletedWithCodes.length > 0) {
            console.log('\n--- Sample Deleted with Codes ---');
            deletedWithCodes.slice(0, 10).forEach(r => {
                console.log(`ID: ${r._id} | Code: ${r.customerCode} | Company: ${r.company} | GST: ${r.gstNumber}`);
            });
        }

        // --- Cross Check with Corrupted Active ---
        const activeCodes = (await db.collection('customers').distinct('company', { company: /^CUST-/ }));
        console.log(`\nUnique Corrupted Codes in Active records (as names): ${activeCodes.length}`);

        const foundInDeleted = deletedWithCodes.filter(r => activeCodes.includes(r.customerCode));
        console.log(`Matches by customerCode found in Deleted records: ${foundInDeleted.length}`);

        if (foundInDeleted.length > 0) {
            console.log('\n--- Match Sample ---');
            foundInDeleted.slice(0, 5).forEach(m => {
                console.log(`Code: ${m.customerCode} -> Real Name: ${m.company}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
