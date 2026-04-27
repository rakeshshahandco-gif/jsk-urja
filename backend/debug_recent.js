import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const items = await Item.find({}).sort({ createdAt: -1 }).limit(10).select('itemCode itemName itemCategory createdAt');
        console.log('Most Recent 10 Items:');
        console.log(JSON.stringify(items, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
