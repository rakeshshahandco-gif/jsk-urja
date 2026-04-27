import mongoose from 'mongoose';
import { Item } from './backend/src/models/item.model.js';

async function checkItems() {
    try {
        await mongoose.connect('mongodb://localhost:27017/jsk_urja');
        const categories = await Item.distinct('itemCategory');
        console.log('Categories:', categories);
        const counts = await Item.aggregate([
            { $group: { _id: '$itemCategory', count: { $sum: 1 } } }
        ]);
        console.log('Counts:', counts);
        
        const activeFinished = await Item.countDocuments({ itemCategory: 'FINISHED_GOOD', isActive: true });
        console.log('Active Finished Goods:', activeFinished);

        const sampleItems = await Item.find({ itemCategory: 'FINISHED_GOOD', isActive: true }).limit(5).select('itemCode itemName');
        console.log('Sample Finished Goods:', JSON.stringify(sampleItems, null, 2));

        const activeTrading = await Item.countDocuments({ itemCategory: 'TRADING', isActive: true });
        console.log('Active Trading Goods:', activeTrading);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkItems();
