import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        const prodUrl = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-prod?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';
        await mongoose.connect(prodUrl);
        const search = 'JSUNN';
        const items = await Item.find({ 
            $or: [
                { itemCode: { $regex: search, $options: 'i' } },
                { itemName: { $regex: search, $options: 'i' } }
            ]
        }).select('itemCode itemName itemCategory isActive');
        
        console.log(`Found ${items.length} items matching "${search}" in PROD:`);
        console.log(JSON.stringify(items, null, 2));

        const allItemsCount = await Item.countDocuments({});
        console.log('Total items in PROD DB:', allItemsCount);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
