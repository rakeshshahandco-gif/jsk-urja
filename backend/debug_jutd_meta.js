import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const search = 'JUTD';
        const items = await Item.find({ 
            itemCode: { $regex: search, $options: 'i' }
        }).select('itemCode itemCategory isActive isManufacturable');
        
        console.log(`Found ${items.length} items:`);
        console.log(JSON.stringify(items, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
