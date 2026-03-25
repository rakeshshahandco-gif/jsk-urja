/**
 * Script to flag automated vouchers as isSystemGenerated
 * Run: node src/scripts/markSystemGenerated.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async () => {
    const url = process.env.MONGODB_URL;
    if (!url) throw new Error('MONGODB_URL not found in environment');
    await mongoose.connect(url);
    console.log('Connected to MongoDB');
};

const run = async () => {
    await connectDB();
    
    // Pattern 1: Narrations from postSalesInvoiceToLedger
    // "Auto-generated from Sales Invoice..."
    const salesPattern = /Auto-generated from Sales Invoice/;
    
    // Pattern 2: Narrations from backfillSalesLedger.js
    // "[Backfill] Sales Invoice..."
    const backfillPattern = /\[Backfill\] Sales Invoice/;
    
    // Pattern 3: Automated receipts (as seen in the user screenshot)
    // "Receipt against Sales Invoice..."
    const receiptPattern = /Receipt against Sales Invoice/;

    const filter = {
        $or: [
            { narration: salesPattern },
            { narration: backfillPattern },
            { narration: receiptPattern },
            { narration: /Auto-generated from Purchase Invoice/ }
        ],
        isSystemGenerated: { $ne: true }
    };

    const count = await mongoose.connection.db.collection('vouchers').countDocuments(filter);
    console.log(`Found ${count} vouchers to flag as system-generated.`);

    if (count > 0) {
        const result = await mongoose.connection.db.collection('vouchers').updateMany(
            filter,
            { $set: { isSystemGenerated: true } }
        );
        console.log(`Successfully flagged ${result.modifiedCount} vouchers.`);
    }

    console.log('Cleanup complete.');
    process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
