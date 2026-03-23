import mongoose from 'mongoose';
const { model, Schema, connect, disconnect } = mongoose;

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function search() {
    try {
        await connect(MONGODB_URL);
        console.log('Connected to DB');

        const Item = model('Item', new Schema({}, { strict: false }));
        const items = await Item.find({ itemCode: /JUAD/i });
        console.log('Search Results for JUAD:');
        console.log(JSON.stringify(items, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await disconnect();
    }
}

search();
