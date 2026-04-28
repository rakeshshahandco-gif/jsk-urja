import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WeChatGroup } from './src/models/weChatGroup.model.js';
import { WeChatGroupMember } from './src/models/weChatGroupMember.model.js';
import { WeChatPriceRecord } from './src/models/weChatPriceRecord.model.js';
import { WeChatProduct } from './src/models/weChatProduct.model.js';
import { WeChatContact } from './src/models/weChatContact.model.js';

dotenv.config({ path: './.env' });

const MONGO_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

async function checkDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const groups = await WeChatGroup.find({ groupName: 'MKP CAPACITOR' });
        
        for (const g of groups) {
            console.log(`\nGroup: ${g.groupName} (${g._id})`);
            console.log(`ProductIds: ${g.productIds}`);
            
            const members = await WeChatGroupMember.find({ groupId: g._id }).populate('contactId');
            console.log(`Members count: ${members.length}`);
            for (const m of members) {
                console.log(` - Member: ${m.contactId?.weChatDisplayName || 'Unknown'} (Role: ${m.roleInGroup})`);
            }
            
            const rates = await WeChatPriceRecord.find({ groupId: g._id });
            console.log(`Rates count: ${rates.length}`);
            for (const r of rates) {
                console.log(` - Rate: ${r.productName} (${r.price} ${r.currency})`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDB();
