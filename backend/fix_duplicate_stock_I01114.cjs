const mongoose = require('mongoose');
const { Item } = require('./src/models/item.model.js');
const { StockLedger } = require('./src/models/stockLedger.model.js');
const { recalculateStockLedger } = require('./src/utils/stockUtils.js');

const MONGO_URI = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function cleanupI01114() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to Database");
        
        const item = await Item.findOne({ itemCode: 'I01114' });
        if (!item) {
            console.log("Item I01114 not found");
            return;
        }

        console.log(`Current State - Code: ${item.itemCode}, Opening: ${item.openingStock}, Current: ${item.currentStock}`);

        // Find ledger entries
        const ledger = await StockLedger.find({ itemId: item._id }).sort({ date: 1, createdAt: 1 });
        console.log(`Found ${ledger.length} ledger entries.`);

        // Detect duplicates
        // If we find an OPENING entry of 548 and a GRN of 548, and user says total should be 548...
        // We will remove the redundant one.
        
        let openingEntry = ledger.find(l => l.transactionType === 'OPENING');
        let grnEntry = ledger.find(l => l.transactionType === 'GRN' || l.transactionType === 'PURCHASE_INVOICE');

        if (openingEntry && grnEntry && openingEntry.inQty === grnEntry.inQty) {
            console.log(`Detected likely duplicate: OPENING (${openingEntry.inQty}) and ${grnEntry.transactionType} (${grnEntry.inQty})`);
            console.log(`Removing OPENING entry ${openingEntry._id} as requested by user.`);
            
            await StockLedger.findByIdAndDelete(openingEntry._id);
            console.log("Deleted redundant OPENING entry.");

            // Recalculate
            console.log("Recalculating stock...");
            await recalculateStockLedger(item._id);
            
            const updatedItem = await Item.findById(item._id);
            console.log(`Updated State - Code: ${updatedItem.itemCode}, Opening: ${updatedItem.openingStock}, Current: ${updatedItem.currentStock}`);
        } else {
            console.log("No obvious double-count detected (needs matching qty). Manual check suggested.");
        }

    } catch (err) {
        console.error("Cleanup Failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

cleanupI01114();
