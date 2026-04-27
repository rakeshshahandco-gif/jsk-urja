import mongoose from 'mongoose';
import { Item } from './src/models/item.model.js';
import { Group } from './src/models/group.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const groups = await Group.find({ $or: [{ name: /FINISH/i }, { code: /FINISH/i }] });
        console.log('Relevant Groups:', JSON.stringify(groups, null, 2));

        const itemSample = await Item.findOne({ itemGroupName: { $ne: '' } }).select('itemGroupName itemCode');
        console.log('Item Sample:', JSON.stringify(itemSample, null, 2));

        const finishItems = await Item.countDocuments({ itemGroupName: 'FINISH PRODUCT' });
        console.log('Count of items with group "FINISH PRODUCT":', finishItems);

        const finishProdItems = await Item.countDocuments({ itemGroupName: 'FINISHPROD' });
        console.log('Count of items with group "FINISHPROD":', finishProdItems);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
