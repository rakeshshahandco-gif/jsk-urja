import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const count = await Item.countDocuments({ isManufacturable: true, isActive: true });
        console.log('Total Manufacturable Items:', count);

        const samples = await Item.find({ isManufacturable: true, isActive: true }).limit(5).select('itemCode itemName itemCategory');
        console.log('Sample Manufacturable Items:', JSON.stringify(samples, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkItems();
