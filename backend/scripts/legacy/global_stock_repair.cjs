const mongoose = require('mongoose');
const { Item } = require('./src/models/item.model.js');
const { StockLedger } = require('./src/models/stockLedger.model.js');
const { recalculateStockLedger } = require('./src/utils/stockUtils.js');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function globalRepair() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to Database");
        
        const items = await Item.find({});
        console.log(`Starting global stock repair for ${items.length} items...`);

        let count = 0;
        let errors = 0;

        for (const item of items) {
            try {
                // We use recalculateStockLedger which we've verified works correctly
                await recalculateStockLedger(item._id);
                count++;
                if (count % 100 === 0) console.log(`Processed ${count}/${items.length} items...`);
            } catch (err) {
                console.error(`Error processing ${item.itemCode}:`, err.message);
                errors++;
            }
        }

        console.log("Repair Completed!");
        console.log(`Successfully recalculated: ${count}`);
        console.log(`Errors encountered: ${errors}`);

    } catch (err) {
        console.error("Global Repair Failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

globalRepair();
