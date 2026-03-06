import mongoose from 'mongoose';

const MONGODB_URL = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

const woSchema = new mongoose.Schema({}, { strict: false });
const WorkOrder = mongoose.model('WorkOrder', woSchema, 'workorders');

async function run() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected');

        const wos = await WorkOrder.find({}).sort({ createdAt: -1 });
        if (wos.length <= 1) {
            console.log('Only 1 or 0 WOs exist. Done.');
        } else {
            const toKeep = wos[0];
            const toDelete = wos.slice(1).map(x => x._id);
            console.log(`Keeping ${toKeep.woNumber}, deleting ${toDelete.length} others.`);
            const res = await WorkOrder.deleteMany({ _id: { $in: toDelete } });
            console.log(`Deleted ${res.deletedCount}`);
        }
        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}

run();
