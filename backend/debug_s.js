import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const search = '^S';
        const items = await Item.find({ 
            itemCode: { $regex: search, $options: 'i' }
        }).select('itemCode').limit(20);
        
        console.log(`Found ${items.length} items starting with S:`);
        console.log(items.map(i => i.itemCode));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
