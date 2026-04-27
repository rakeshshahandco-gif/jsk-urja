import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkItems() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const items = await Item.find({ isActive: true }).select('itemCode itemName itemCategory isManufacturable').limit(100);
        console.log('Total Items fetched:', items.length);
        
        const categories = {};
        items.forEach(i => {
            categories[i.itemCategory] = (categories[i.itemCategory] || 0) + 1;
        });
        console.log('Category breakdown of first 100 items:', categories);

        const juItems = items.filter(i => i.itemCode.startsWith('JU') || i.itemName.startsWith('JU'));
        console.log('JU Items count:', juItems.length);
        if (juItems.length > 0) {
            console.log('Sample JU Items:', JSON.stringify(juItems.slice(0, 5), null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkItems();
