import mongoose from 'mongoose';
import { StockLedger } from './models/stockLedger.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkLedger() {
    try {
        const url = process.env.MONGODB_URL || process.env.MONGODB_URI;
        await mongoose.connect(url);
        console.log('Connected to DB');
        
        const entries = await StockLedger.find({ itemCode: 'I01114' }).sort({ date: 1 });
        console.log('--- ALL Ledger Entries for I01114 (Ascending) ---');
        let runningTotal = 548; // Opening
        entries.forEach(e => {
            const movement = (e.inQty || 0) - (e.outQty || 0);
            runningTotal += movement;
            console.log(`Date: ${e.date.toISOString().split('T')[0]}, Type: ${e.transactionType}, In: ${e.inQty}, Out: ${e.outQty}, Ref: ${e.referenceNo}, Running: ${runningTotal}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLedger();
