import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const MONGO_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/jskurja-prod';

async function fixVoucherTypes() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        
        // Fix Journal nature
        const res = await db.collection('vouchertypes').updateOne(
            { name: 'JOURNAL', nature: 'Receipt' },
            { $set: { nature: 'Journal' } }
        );
        console.log(`Updated JOURNAL nature: ${res.modifiedCount}`);

        // Set default prefixes if missing
        const vtList = await db.collection('vouchertypes').find({}).toArray();
        for (const vt of vtList) {
            if (!vt.prefix) {
                const naturePrefixes = {
                    'Receipt': 'RV',
                    'Payment': 'PV',
                    'Contra': 'CV',
                    'Journal': 'JV',
                    'Expense': 'EV',
                    'Debit Note': 'DN',
                    'Credit Note': 'CN',
                    'Sales': 'SI',
                    'Purchase': 'PI'
                };
                const newPrefix = naturePrefixes[vt.nature] || 'V';
                // await db.collection('vouchertypes').updateOne({ _id: vt._id }, { $set: { prefix: newPrefix } });
                // console.log(`Set prefix for ${vt.name} to ${newPrefix}`);
                // Actually the controller now handles empty prefix by nature, 
                // but setting it in DB is better for transparency.
            }
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixVoucherTypes();
