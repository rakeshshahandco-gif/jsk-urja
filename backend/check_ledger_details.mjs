
import mongoose from 'mongoose';
import { AccountLedger } from './src/models/accountLedger.model.js';
import { LedgerEntry } from './src/models/ledgerEntry.model.js';

async function checkLedgerDetails() {
    await mongoose.connect('mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true');
    
    const id = "69c238d04630f0dab9b54974";
    const ledger = await AccountLedger.findById(id);
    console.log(`Ledger Details:`, JSON.stringify(ledger, null, 2));
    
    const entries = await LedgerEntry.find({ ledgerId: id });
    console.log(`Ledger Entries: ${entries.length}`);
    
    await mongoose.disconnect();
}

checkLedgerDetails().catch(console.error);
