import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function audit() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const PI = mongoose.model('PurchaseInvoice', new mongoose.Schema({}, { strict: false }));
        const PO = mongoose.model('PurchaseOrder', new mongoose.Schema({}, { strict: false }));

        const invoice = await PI.findOne({ invoiceNumber: 'PI-202604-0002' });
        const order = await PO.findOne({ poNumber: 'PO-2026-00054' });

        if (invoice) {
            console.log('--- PURCHASE INVOICE ---');
            console.log(JSON.stringify(invoice, null, 2));
        } else {
            console.log('Purchase Invoice PI-202604-0002 not found.');
        }

        if (order) {
            console.log('\n--- PURCHASE ORDER ---');
            console.log(JSON.stringify(order, null, 2));
        } else {
            console.log('Purchase Order PO-2026-00054 not found.');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

audit();
