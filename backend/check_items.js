import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const groups = await Item.distinct('itemGroupName');
        console.log('Unique Item Group Names:', JSON.stringify(groups, null, 2));
        
        const finishItems = await Item.find({ 
            $or: [
                { itemGroupName: /FINISH/i },
                { itemCode: /FINISH/i }
            ]
        }).select('itemCode itemGroupName itemCategory').limit(10);
        console.log('Sample Finished Items:', JSON.stringify(finishItems, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
