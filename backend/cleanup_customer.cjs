const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const db = mongoose.connection.db;
        
        const customer = await db.collection('customers').findOne({ customerCode: 'CU546' });
        if (!customer) {
            console.log('Customer CU546 not found');
            return;
        }

        const now = new Date();
        const reason = 'Cleanup by Admin: Corrupt/Problem record request';

        // 1. Soft delete customer
        const custResult = await db.collection('customers').updateOne(
            { _id: customer._id },
            { 
                $set: { 
                    isDeleted: true, 
                    deletedAt: now,
                } 
            }
        );
        console.log(`Soft deleted customer [${customer.customerCode}] ${customer.company || customer.customerName}`);

        // 2. Soft delete associated ledger
        const ledgerResult = await db.collection('accountledgers').updateMany(
            { referenceId: customer._id },
            { 
                $set: { 
                    isDeleted: true,
                    // Note: Depending on the system, ledgers might not have isDeleted, 
                    // but we'll set it just in case or rename names to avoid conflicts.
                    name: `${customer.company || customer.customerName || 'CU546'}-DELETED-${Date.now()}`
                } 
            }
        );
        console.log(`Updated ${ledgerResult.modifiedCount} account ledger(s)`);

        console.log('Cleanup completed successfully');

    } catch (err) {
        console.error('Cleanup failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
