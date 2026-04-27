import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const categories = await Item.distinct('itemCategory');
        console.log('--- UNIQUE CATEGORIES ---');
        console.log(categories);
        console.log('--- END ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
