const mongoose = require('mongoose');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected");

        const grandTotal = await mongoose.connection.db.collection('items').aggregate([
            { $group: { _id: null, total: { $sum: { $multiply: ["$currentStock", "$valuationRate"] } } } }
        ]).toArray();
        console.log("Grand Total Multi-Category Value:", grandTotal[0]?.total);

        const breakDown = await mongoose.connection.db.collection('items').aggregate([
            { $group: { _id: "$itemCategory", total: { $sum: { $multiply: ["$currentStock", "$valuationRate"] } } } }
        ]).toArray();
        console.log("Value Break-down:", breakDown);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
