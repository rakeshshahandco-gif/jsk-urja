import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const count = await Item.countDocuments({});
        console.log('Total Items in DB:', count);
        const samples = await Item.find({}).limit(5).select('itemCode');
        console.log('Sample codes:', samples.map(i => i.itemCode));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
