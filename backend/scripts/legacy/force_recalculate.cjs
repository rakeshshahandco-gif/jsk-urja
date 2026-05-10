const mongoose = require('mongoose');
const { Item } = require('./src/models/item.model.js');
const { StockLedger } = require('./src/models/stockLedger.model.js');
const { recalculateStockLedger } = require('./src/utils/stockUtils.js');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function globalRecalculate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to Database");
        
        const items = await Item.find({ isActive: true });
        console.log(`Checking stock for ${items.length} items...`);

        for (const item of items) {
           await recalculateStockLedger(item._id);
        }

        console.log("Recalculation complete for all active items.");

    } catch (err) {
        console.error("Task Failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

globalRecalculate();
