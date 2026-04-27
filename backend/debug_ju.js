import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const search = '^JU';
        const items = await Item.find({ 
            itemCode: { $regex: search, $options: 'i' }
        }).select('itemCode itemName itemCategory isActive');
        
        console.log(`Found ${items.length} items starting with "JU":`);
        console.log(items.map(i => i.itemCode).join(', '));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
