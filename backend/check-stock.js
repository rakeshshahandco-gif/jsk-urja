import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URL;

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const itemNames = ['7D MOV', 'FUSE 3 AMP', 'MB10F', '220PF/1KV', '221'];

        for (const name of itemNames) {
            const item = await Item.findOne({ itemName: new RegExp(name, 'i') });
            if (item) {
                console.log(`Found item: ${item.itemName}`);
                console.log(`- Opening Stock: ${item.openingStock}`);
                console.log(`- Current Stock:  ${item.currentStock}`);
                console.log('---');
            } else {
                console.log(`Item not found: ${name}`);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await mongoose.disconnect();
    }
}

main();
