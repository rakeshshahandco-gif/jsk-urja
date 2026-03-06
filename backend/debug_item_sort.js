import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const itemSchema = new mongoose.Schema({
    itemCode: String,
    itemName: String,
    itemGroupName: String
});
const Item = mongoose.model('Item', itemSchema);

const debugSort = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const items = await Item.find({})
            .select('itemCode itemName')
            .sort({ itemCode: 1 })
            .limit(20)
            .lean();

        console.log('Sorted by itemCode (ASC):');
        items.forEach((item, i) => {
            console.log(`${i + 1}. Code: [${item.itemCode}] | Name: [${item.itemName}]`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

debugSort();
