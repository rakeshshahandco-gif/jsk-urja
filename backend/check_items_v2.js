import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const manufacturableRaw = await Item.countDocuments({ 
            itemCategory: 'RAW_MATERIAL', 
            isManufacturable: true,
            isActive: true 
        });
        console.log('Manufacturable Raw Materials:', manufacturableRaw);

        const trading = await Item.countDocuments({ 
            itemCategory: 'TRADING', 
            isActive: true 
        });
        console.log('Trading Items:', trading);

        const wip = await Item.countDocuments({ 
            itemCategory: 'WIP', 
            isActive: true 
        });
        console.log('WIP Items:', wip);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkItems();
