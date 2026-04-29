
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { LedgerEntry } from './src/models/ledgerEntry.model.js';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        
        const entry = await LedgerEntry.findOne({}).lean();
        if (entry) {
            console.log('LedgerEntry Document:', JSON.stringify(entry, null, 2));
            console.log('Type of date:', typeof entry.date);
        } else {
            console.log('No LedgerEntries found');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
