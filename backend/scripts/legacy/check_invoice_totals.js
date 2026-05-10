
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

dotenv.config({ path: './.env' });

const checkTotals = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        
        const invoicesWithZeroTaxable = await SalesInvoice.find({ totalTaxableAmount: 0 }).lean();
        console.log('Invoices with totalTaxableAmount = 0:', invoicesWithZeroTaxable.length);
        
        if (invoicesWithZeroTaxable.length > 0) {
            const sample = invoicesWithZeroTaxable[0];
            console.log('Sample Invoice:', sample.invoiceNumber);
            console.log('Sample Items:', JSON.stringify(sample.items, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkTotals();
