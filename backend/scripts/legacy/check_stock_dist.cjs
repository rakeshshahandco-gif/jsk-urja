const mongoose = require('mongoose');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected");
        
        const counts = await mongoose.connection.db.collection('items').aggregate([
            { $group: {
                _id: "$itemCategory",
                total: { $sum: 1 },
                withStock: { $sum: { $cond: [{ $gt: ["$currentStock", 0] }, 1, 0] } },
                zeroStock: { $sum: { $cond: [{ $eq: ["$currentStock", 0] }, 1, 0] } }
            }}
        ]).toArray();
        console.log("Stock Status by Category:", counts);

        const samples = await mongoose.connection.db.collection('items').find({ currentStock: { $gt: 0 } }).limit(5).toArray();
        console.log("Sample Items with Stock:", samples.map(s => ({ code: s.itemCode, name: s.itemName, stock: s.currentStock })));

        const totalValue = await mongoose.connection.db.collection('items').aggregate([
            { $match: { itemCategory: 'RAW_MATERIAL' } },
            { $group: { _id: null, total: { $sum: { $multiply: ["$currentStock", "$valuationRate"] } } } }
        ]).toArray();
        console.log("Calculated Raw Material Value:", totalValue[0]?.total);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
