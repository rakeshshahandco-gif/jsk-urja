const mongoose = require('mongoose');
const { Item } = require('./src/models/item.model.js');
const { StockLedger } = require('./src/models/stockLedger.model.js');
const { recalculateStockLedger } = require('./src/utils/stockUtils.js');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function test() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected");
        
        const itemCode = "I00001";
        const item = await Item.findOne({ itemCode });
        console.log("Before Recalculate:", { code: item.itemCode, opening: item.openingStock, current: item.currentStock });

        await recalculateStockLedger(item._id);

        const updatedItem = await Item.findById(item._id);
        console.log("After Recalculate:", { code: updatedItem.itemCode, opening: updatedItem.openingStock, current: updatedItem.currentStock });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

test();
