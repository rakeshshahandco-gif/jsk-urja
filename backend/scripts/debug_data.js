const mongoose = require('mongoose');

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function check() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to DB');

        const Supplier = mongoose.model('Supplier', new mongoose.Schema({}, { strict: false }));
        const s = await Supplier.findOne({ supplierName: /PRISM ELECTRONICS/i });
        if (s) {
            console.log('Supplier Found:');
            console.log(JSON.stringify(s, null, 2));
        } else {
            console.log('Supplier Not Found');
        }

        const PO = mongoose.model('PurchaseOrder', new mongoose.Schema({}, { strict: false }));
        const po = await PO.findOne({ poNumber: 'PO-2026-00011' });
        if (po) {
            console.log('\nPO Found:');
            console.log(JSON.stringify(po, null, 2));
        } else {
            console.log('PO Not Found');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
