import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const MONGO_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/jskurja-prod';

async function checkVoucherTypes() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const vTypes = await db.collection('vouchertypes').find({}).toArray();

        console.log(`Total voucher types: ${vTypes.length}`);
        vTypes.forEach(vt => {
            console.log(`Name: ${vt.name}, Nature: ${vt.nature}, Prefix: "${vt.prefix}", Next: ${vt.nextNumber}, FY: ${vt.financialYear}`);
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkVoucherTypes();
