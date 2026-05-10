import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

const itemSchema = new mongoose.Schema({}, { strict: false });
const piSchema = new mongoose.Schema({}, { strict: false });
const bomSchema = new mongoose.Schema({}, { strict: false });

const Item = mongoose.model('Item', itemSchema);
const PurchaseInvoice = mongoose.model('PurchaseInvoice', piSchema);
const BOM = mongoose.model('BOM', bomSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.');

        const item = await Item.findOne({ itemName: /4N65/i });
        if (!item) {
            console.log('ITEM_NOT_FOUND');
            return;
        }
        console.log('ITEM:', JSON.stringify({ _id: item._id, itemName: item.itemName, purchaseRate: item.purchaseRate }, null, 2));

        const pi = await PurchaseInvoice.findOne({ 'items.itemId': item._id }).sort({ createdAt: -1 });
        if (pi) {
            console.log('LATEST_PI:', JSON.stringify({ invoiceNumber: pi.invoiceNumber, createdAt: pi.createdAt, items: pi.items.filter(i => i.itemId.toString() === item._id.toString()) }, null, 2));
        } else {
            console.log('NO_PI_FOUND');
        }

        const boms = await BOM.find({ 'components.itemId': item._id });
        console.log('AFFECTED_BOMS:', boms.length);
        boms.forEach(b => {
            const comp = b.components.find(c => c.itemId.toString() === item._id.toString());
            console.log(`- BOM ${b.bomNumber}: Rate=${comp.rate}, TotalRawMaterialCost=${b.totalRawMaterialCost}`);
        });

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
