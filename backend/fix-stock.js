import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URL;

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const items = await Item.find({ currentStock: 0, openingStock: { $gt: 0 } });
        console.log(`Found ${items.length} items needing stock sync.`);

        let count = 0;
        for (const item of items) {
            item.currentStock = item.openingStock;
            await item.save();
            count++;
        }

        console.log(`Successfully synced ${count} items.`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await mongoose.disconnect();
    }
}

main();
