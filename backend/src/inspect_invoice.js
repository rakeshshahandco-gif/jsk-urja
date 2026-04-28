import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Try loading from root then backend
dotenv.config({ path: path.join(process.cwd(), '../.env') });
dotenv.config(); 

const url = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm_test';
console.log('Connecting to:', url);

async function checkInvoice() {
    try {
        await mongoose.connect(url);
        console.log('Connected to DB');

        // Check collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        const SalesInvoice = mongoose.connection.collection('salesinvoices');

        const inv = await SalesInvoice.findOne({ invoiceNumber: '26-27/01' });
        if (inv) {
            console.log('Found Invoice 26-27/01:');
            console.log(JSON.stringify(inv, null, 2));
        } else {
            console.log('Invoice 26-27/01 not found.');
            // Try searching by displayInvoiceNumber
            const inv2 = await SalesInvoice.findOne({ displayInvoiceNumber: '26-27/01' });
             if (inv2) {
                console.log('Found Invoice via displayInvoiceNumber:');
                console.log(JSON.stringify(inv2, null, 2));
            } else {
                const anyInv = await SalesInvoice.findOne({});
                if (anyInv) {
                    console.log('Found another invoice for structure check:');
                    console.log(JSON.stringify(anyInv, null, 2));
                }
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkInvoice();
