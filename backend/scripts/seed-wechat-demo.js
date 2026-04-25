import mongoose from 'mongoose';
import { WeChatGroup } from '../src/models/weChatGroup.model.js';
import { WeChatContact } from '../src/models/weChatContact.model.js';
import { WeChatGroupMember } from '../src/models/weChatGroupMember.model.js';
import { WeChatProduct } from '../src/models/weChatProduct.model.js';
import { WeChatPriceRecord } from '../src/models/weChatPriceRecord.model.js';
import dotenv from 'dotenv';

dotenv.config();

const seedDemoData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        // Cleanup existing demo data
        await WeChatProduct.deleteMany({ partNumber: 'ZT2S' });
        await WeChatContact.deleteMany({ entryNo: /^WCC-DEMO/ });
        await WeChatGroup.deleteMany({ entryNo: /^WCG-DEMO/ });
        await WeChatGroupMember.deleteMany({}); // Warning: This clears all members, but okay for demo setup
        await WeChatPriceRecord.deleteMany({ partNumber: 'ZT2S' });

        // 1. Create Product
        const product = await WeChatProduct.create({
            productName: 'ZT2S Zigbee Module',
            partNumber: 'ZT2S',
            category: 'Zigbee',
            brandName: 'Tuya',
            modelNo: 'ZT2S-01',
            status: 'Regular Purchase'
        });

        // 2. Create Contacts (Members A1, A2, A3)
        const contacts = [];
        for (let i = 1; i <= 3; i++) {
            const contact = await WeChatContact.create({
                entryNo: `WCC-DEMO-00${i}`,
                weChatDisplayName: `Supplier A${i}`,
                englishName: `Alice ${i}`,
                companyName: 'Tuya Tech Ltd',
                weChatId: `tuya_alice_${i}`,
                role: 'Sales',
                source: 'WeChat'
            });
            contacts.push(contact);
        }

        // 3. Create Groups (1, 2, 3)
        for (let i = 1; i <= 3; i++) {
            const group = await WeChatGroup.create({
                entryNo: `WCG-DEMO-00${i}`,
                groupName: `ZT2S Tech Group ${i}`,
                groupAlias: `ZT2S Group ${i}`,
                purpose: 'Technical support and pricing for ZT2S'
            });

            // Add members to group
            for (const contact of contacts) {
                await WeChatGroupMember.create({
                    groupId: group._id,
                    contactId: contact._id,
                    roleInGroup: 'General Member'
                });

                // Create Price Records for each member in each group
                await WeChatPriceRecord.create({
                    productId: product._id,
                    groupId: group._id,
                    contactId: contact._id,
                    partNumber: 'ZT2S',
                    productName: 'ZT2S Zigbee Module',
                    price: 2.5 + (i * 0.1) + (contacts.indexOf(contact) * 0.05),
                    currency: 'USD',
                    moq: 500,
                    remarks: `Quote from Group ${i} by ${contact.weChatDisplayName}`
                });
            }
        }

        console.log('Demo data seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
};

seedDemoData();
