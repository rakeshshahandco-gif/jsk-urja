import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const items = await Item.find({ itemCode: { $regex: '^JU', $options: 'i' } }).select('itemCode').lean();
        const codes = items.map(i => i.itemCode);
        console.log(`Found ${codes.length} codes:`);
        console.log(codes.sort().join(', '));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
