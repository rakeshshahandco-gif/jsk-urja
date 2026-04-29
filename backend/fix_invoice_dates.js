
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

dotenv.config({ path: './.env' });

const fixData = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const allInvoices = await SalesInvoice.find({}).lean();
        console.log('Total Invoices to check:', allInvoices.length);

        let fixedCount = 0;
        for (const inv of allInvoices) {
            if (typeof inv.invoiceDate === 'string') {
                const dateObj = new Date(inv.invoiceDate);
                if (!isNaN(dateObj.getTime())) {
                    await SalesInvoice.updateOne(
                        { _id: inv._id },
                        { $set: { invoiceDate: dateObj } }
                    );
                    fixedCount++;
                }
            }
        }

        console.log('Successfully converted', fixedCount, 'invoices to Date objects.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixData();
