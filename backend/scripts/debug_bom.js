import mongoose from 'mongoose';
const { Schema, model, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function debug() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const BOM = model('BOM', new Schema({}, { strict: false }));
        const Item = model('Item', new Schema({}, { strict: false }));

        const bomId = '69be8876aa6559a5fcbd0799';
        const bom = await BOM.findById(bomId);

        if (bom) {
            console.log('BOM Found:');
            console.log(JSON.stringify(bom, null, 2));
        } else {
            console.log('BOM not found by ID.');
        }

        const targetItemCode = 'JUNCTD15N5Y_55V_300MA';
        const item = await Item.findOne({ itemCode: targetItemCode });
        if (item) {
            console.log(`Target Item found: ${item.itemCode} (_id: ${item._id})`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await disconnect();
    }
}

debug();
