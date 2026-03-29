const mongoose = require('mongoose');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        const res = await mongoose.connection.db.collection('items').aggregate([
            { $match: { currentStock: { $gt: 0 } } },
            { $group: { _id: null, totalVal: { $sum: { $multiply: ['$currentStock', '$valuationRate'] } }, totalPur: { $sum: { $multiply: ['$currentStock', '$purchaseRate'] } } } }
        ]).toArray();
        console.log(JSON.stringify(res));
    } finally {
        await mongoose.disconnect();
    }
}

check();
