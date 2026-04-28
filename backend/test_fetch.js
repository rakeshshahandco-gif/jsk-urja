import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WeChatGroup } from './src/models/weChatGroup.model.js';
import { WeChatGroupMember } from './src/models/weChatGroupMember.model.js';
import { WeChatPriceRecord } from './src/models/weChatPriceRecord.model.js';
import { WeChatProduct } from './src/models/weChatProduct.model.js';
import { WeChatContact } from './src/models/weChatContact.model.js';

dotenv.config({ path: './.env' });

const MONGO_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

async function testFetch() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const groupId = '69ef5706daf7eaf2bf6921ae';
        
        const group = await WeChatGroup.findById(groupId).populate('productIds');
        const members = await WeChatGroupMember.find({ groupId }).populate('contactId');
        const rates = await WeChatPriceRecord.find({ groupId }).populate('productId').populate('contactId');

        const mappedMembers = members.map(m => {
            const c = m.contactId || {};
            return {
                id: m._id,
                _id: m._id,
                contactId: c._id,
                weChatDisplayName: c.weChatDisplayName || '',
                role: m.roleInGroup,
                isMainContact: m.isMainDealingPerson,
                remarks: m.remarks,
                membershipId: m._id
            };
        });

        console.log('--- TEST FETCH RESULTS ---');
        console.log('Group:', group.groupName);
        console.log('Members count:', mappedMembers.length);
        console.log('Members:', JSON.stringify(mappedMembers, null, 2));
        console.log('Rates count:', rates.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testFetch();
