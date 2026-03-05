import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

const itemSchema = new mongoose.Schema({
    itemName: String,
    itemCode: String,
    itemCategory: String,
    itemType: String,
    isActive: Boolean
}, { strict: false });

const Item = mongoose.model('Item', itemSchema);

async function run() {
    try {
        console.log('Connecting to:', process.env.MONGODB_URL);
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.');

        const item = await Item.findOne({
            $or: [
                { itemName: /JUNCTD15N/i },
                { itemCode: /JUNCTD15N/i }
            ]
        });

        if (item) {
            console.log('ITEM_FOUND:', JSON.stringify(item, null, 2));
        } else {
            console.log('ITEM_NOT_FOUND');
            // List some items to see what we have
            const count = await Item.countDocuments();
            console.log('Total items in DB:', count);
            const samples = await Item.find().limit(5);
            console.log('Sample items:', JSON.stringify(samples, null, 2));
        }
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
