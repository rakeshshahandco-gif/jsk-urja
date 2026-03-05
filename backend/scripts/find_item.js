const mongoose = require('mongoose');

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function check() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = mongoose.model('Item', new mongoose.Schema({}, { strict: false }));
        const item = await Item.findOne({ itemName: /JUNCTD15N_45V350MA/i });

        if (item) {
            console.log('Item Found:');
            console.log(JSON.stringify(item, null, 2));
        } else {
            console.log('Item Not Found. Checking partial match...');
            const partial = await Item.findOne({ itemName: /JUNCTD15/i });
            if (partial) {
                console.log('Partial Match Found:');
                console.log(JSON.stringify(partial, null, 2));
            } else {
                console.log('No similar items found.');
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
