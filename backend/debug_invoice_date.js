
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        
        const inv = await SalesInvoice.findOne({ invoiceNumber: '26-27/015' }).lean();
        console.log('Invoice Document:', JSON.stringify(inv, null, 2));
        console.log('Type of invoiceDate:', typeof inv.invoiceDate);
        console.log('invoiceDate value:', inv.invoiceDate);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
