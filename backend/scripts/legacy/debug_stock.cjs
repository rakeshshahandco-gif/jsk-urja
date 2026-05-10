const mongoose = require('mongoose');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected");
        
        const item = await mongoose.connection.db.collection('items').findOne({ itemCode: "I00001" });
        console.log("Item I00001:", item ? {
            id: item._id,
            code: item.itemCode,
            name: item.itemName,
            openingStock: item.openingStock,
            currentStock: item.currentStock,
            valuationRate: item.valuationRate
        } : "Not Found");

        if (item) {
            const ledgerCount = await mongoose.connection.db.collection('stockledgers').countDocuments({ itemId: item._id });
            console.log("Ledger Count for I00001:", ledgerCount);

            const lastLedger = await mongoose.connection.db.collection('stockledgers').find({ itemId: item._id }).sort({ date: -1, createdAt: -1 }).limit(1).toArray();
            console.log("Last Ledger Entry:", lastLedger[0] ? {
                transactionType: lastLedger[0].transactionType,
                inQty: lastLedger[0].inQty,
                outQty: lastLedger[0].outQty,
                runningStock: lastLedger[0].runningStock,
                date: lastLedger[0].date
            } : "None");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
