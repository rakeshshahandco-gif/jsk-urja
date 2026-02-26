import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URL;

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const items = await Item.find({ itemName: { $regex: '7D', $options: 'i' } });
        console.log(`Found ${items.length} items with "7D" in the name:\n`);

        for (const item of items) {
            console.log(`Name: ${item.itemName} | Code: ${item.itemCode}`);
            console.log(`- Opening Stock: ${item.openingStock}`);
            console.log(`- Current Stock:  ${item.currentStock}`);
            console.log('---');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await mongoose.disconnect();
    }
}

main();
