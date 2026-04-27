import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const categories = await Item.distinct('itemCategory');
        console.log('Unique Item Categories in DB:', JSON.stringify(categories, null, 2));
        
        const finishedItems = await Item.find({ 
            itemCategory: { $in: ['FINISHED_GOOD', 'FINISHED', 'Finished Good', 'Finished Goods'] } 
        }).select('itemCode itemGroupName itemCategory').limit(20);
        console.log('Sample Finished Items:', JSON.stringify(finishedItems, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
