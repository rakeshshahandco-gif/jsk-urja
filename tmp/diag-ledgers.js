import mongoose from 'mongoose';
import { AccountLedger } from '../backend/src/models/accountLedger.model.js';

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

const diag = async () => {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB');

        const ls = await AccountLedger.find({ name: /RG/i });
        console.log('--- Ledgers with "RG" ---');
        ls.forEach(l => {
            console.log(`Name: "${l.name}", RefId: ${l.referenceId}, RefModel: ${l.referenceModel}, ID: ${l._id}`);
        });

        const exact = await AccountLedger.findOne({ name: 'RG VENTURES' });
        console.log('--- Exact "RG VENTURES" ---');
        console.log(exact ? `Found! ID: ${exact._id}` : 'Not found by exact name');

        process.exit(0);
    } catch (error) {
        console.error('Diag failed:', error);
        process.exit(1);
    }
};

diag();
