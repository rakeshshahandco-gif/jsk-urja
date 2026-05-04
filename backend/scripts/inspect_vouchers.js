import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const MONGO_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/jskurja-prod';

async function checkVouchers() {
    try {
        console.log('Connecting to:', MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const vouchers = await db.collection('vouchers').find({}).toArray();

        console.log(`Total vouchers: ${vouchers.length}`);

        const stats = {
            noFY: 0,
            noVType: 0,
            noNature: 0
        };

        vouchers.forEach(v => {
            if (!v.financialYear) stats.noFY++;
            if (!v.voucherType) stats.noVType++;
            if (!v.nature) stats.noNature++;
        });

        console.log('Stats:', stats);

        // Check unique indices
        const indices = await db.collection('vouchers').indexes();
        console.log('Current Indices:');
        indices.forEach(idx => console.log(JSON.stringify(idx)));

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkVouchers();
