import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { AccountLedger } from './src/models/accountLedger.model.js';
import { LedgerEntry } from './src/models/ledgerEntry.model.js';

async function debug() {
    await connectDB();
    const l = await AccountLedger.findOne({name: 'RG VENTURES'});
    if(!l) {
        console.log('RG ventures not found');
        process.exit(1);
    }
    const entries = await LedgerEntry.find({ledgerId: l._id});
    console.log('Total entries:', entries.length);
    entries.forEach(e => console.log(e.voucherNo + ' - ' + e.type + ' ' + e.amount));
    process.exit(0);
}

debug();
