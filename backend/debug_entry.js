import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const { LedgerEntry } = await import('./src/models/ledgerEntry.model.js');
        const entries = await LedgerEntry.find({ voucherNo: '0011' }).lean();
        console.log("Found entries:", entries.length);
        console.log(JSON.stringify(entries, null, 2));
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
};

run();
