import mongoose from 'mongoose';
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import * as dotenv from 'dotenv';

dotenv.config();

const fixBalances = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk_urja');
        console.log('✅ Connected to MongoDB');

        const ledgers = await AccountLedger.find({});
        console.log(`📊 Found ${ledgers.length} ledgers to process.`);

        for (const ledger of ledgers) {
            console.log(`⚙️ Processing ledger: ${ledger.name}...`);

            // 1. Calculate signed opening balance
            const opBal = Number(ledger.openingBalance) || 0;
            const signedOpBal = (ledger.drCr === 'Cr') ? -opBal : opBal;

            // 2. Sum up all ledger entries
            const entries = await LedgerEntry.find({ ledgerId: ledger._id });
            const entriesSum = entries.reduce((acc, entry) => {
                return acc + (entry.type === 'Debit' ? entry.amount : -entry.amount);
            }, 0);

            // 3. New current balance
            const newBalance = signedOpBal + entriesSum;

            // 4. Update ledger
            await AccountLedger.findByIdAndUpdate(ledger._id, { currentBalance: newBalance });
            console.log(`   - Fixed ${ledger.name}: Op ${signedOpBal}, Entries ${entriesSum}, Final ${newBalance}`);
        }

        console.log('🎉 All ledger balances have been recalculated and fixed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing balances:', error);
        process.exit(1);
    }
};

fixBalances();
