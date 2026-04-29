
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        
        const allInvoices = await SalesInvoice.find({}).lean();
        let stringCount = 0;
        let dateCount = 0;
        
        allInvoices.forEach(inv => {
            if (typeof inv.invoiceDate === 'string') {
                stringCount++;
            } else if (inv.invoiceDate instanceof Date) {
                dateCount++;
            }
        });

        console.log('Total Invoices:', allInvoices.length);
        console.log('Invoices with string date:', stringCount);
        console.log('Invoices with actual Date object:', dateCount);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
