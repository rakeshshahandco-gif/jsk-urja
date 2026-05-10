
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const totalInvoices = await SalesInvoice.countDocuments({});
        console.log('Total Invoices:', totalInvoices);

        const recentInvoices = await SalesInvoice.find({}).sort({ invoiceDate: -1 }).limit(5).lean();
        console.log('Recent Invoices:');
        recentInvoices.forEach(inv => {
            console.log(`- ${inv.invoiceNumber} | Date: ${inv.invoiceDate} | FY: ${inv.financialYear} | Total: ${inv.grandTotal}`);
        });

        const aprilInvoices = await SalesInvoice.find({
            invoiceDate: {
                $gte: new Date('2026-04-01'),
                $lte: new Date('2026-04-30T23:59:59.999Z')
            }
        }).lean();
        console.log('April 2026 Invoices:', aprilInvoices.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
