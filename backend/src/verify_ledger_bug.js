import mongoose from 'mongoose';
import { AccountLedger } from './models/accountLedger.model.js';
import { LedgerEntry } from './models/ledgerEntry.model.js';
import * as dotenv from 'dotenv';

dotenv.config();

const checkTrialBalance = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk_urja');
        console.log('✅ Connected to MongoDB');

        const ledgers = await AccountLedger.find({});
        console.log(`📊 Total Ledgers: ${ledgers.length}`);

        let totalDebit = 0;
        let totalCredit = 0;

        for (const l of ledgers) {
            const entries = await LedgerEntry.aggregate([
                { $match: { ledgerId: l._id } },
                {
                    $group: {
                        _id: '$ledgerId',
                        net: {
                            $sum: { $cond: [{ $eq: ['$type', 'Debit'] }, '$amount', { $subtract: [0, '$amount'] }] }
                        }
                    }
                }
            ]);

            const statsNet = entries.length > 0 ? entries[0].net : 0;
            
            // Correct Logic:
            const signedOpBal = (l.drCr === 'Cr') ? -(l.openingBalance || 0) : (l.openingBalance || 0);
            const expectedBalance = signedOpBal + statsNet;
            const actualBalance = l.currentBalance || 0;

            if (Math.abs(expectedBalance - actualBalance) > 0.01) {
                console.log(`❌ Inconsistency in ${l.name}:`);
                console.log(`   - Opening: ${l.openingBalance} ${l.drCr}`);
                console.log(`   - Expected: ${expectedBalance.toFixed(2)}`);
                console.log(`   - Actual DB: ${actualBalance.toFixed(2)}`);
                console.log(`   - Diff: ${(expectedBalance - actualBalance).toFixed(2)}`);
            }

            if (actualBalance > 0) totalDebit += actualBalance;
            else totalCredit += Math.abs(actualBalance);
        }

        console.log('--- DATABASE TOTALS ---');
        console.log(`Total Debit: ${totalDebit.toFixed(2)}`);
        console.log(`Total Credit: ${totalCredit.toFixed(2)}`);
        console.log(`Difference: ${(totalDebit - Math.abs(totalCredit)).toFixed(2)}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

checkTrialBalance();
