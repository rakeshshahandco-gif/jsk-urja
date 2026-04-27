import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const items = await Item.find({ itemCode: { $regex: '^JUTD', $options: 'i' } }).select('itemCode').lean();
        console.log(`Found ${items.length} codes starting with JUTD:`);
        console.log(items.map(i => i.itemCode).sort().join(', '));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
