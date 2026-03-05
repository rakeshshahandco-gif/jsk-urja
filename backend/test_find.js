import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URL;

async function run() {
    try {
        await mongoose.connect(url);
        console.log('Connected');
        const coll = mongoose.connection.collection('items');
        const item = await coll.findOne({
            $or: [
                { itemCode: 'JUNCTD15N_45V350MA' },
                { itemName: 'JUNCTD15N_45V350MA' },
                { itemName: /JUNCTD15N/i }
            ]
        });
        if (item) {
            console.log('FOUND:', JSON.stringify(item, null, 2));
        } else {
            console.log('NOT_FOUND');
            const count = await coll.countDocuments();
            console.log('Total items:', count);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
