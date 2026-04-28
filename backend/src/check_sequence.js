import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkSequence() {
    try {
        const url = process.env.MONGODB_URL;
        await mongoose.connect(url);
        const invoices = await mongoose.connection.collection('salesinvoices').find({
            invoiceDate: { $regex: /^2026-04/ } // Simple regex for string dates or ISO starts
        }).project({ invoiceNumber: 1, sequenceNumber: 1, invoiceDate: 1 }).toArray();
        
        // Also check with Date objects
        const startDate = new Date('2026-04-01');
        const endDate = new Date('2026-04-30T23:59:59.999Z');
        const invoices2 = await mongoose.connection.collection('salesinvoices').find({
            invoiceDate: { $gte: startDate, $lte: endDate }
        }).project({ invoiceNumber: 1, sequenceNumber: 1, invoiceDate: 1 }).toArray();

        console.log('April Invoices (Regex/String):', invoices.length);
        invoices.forEach(i => console.log(`${i.invoiceNumber}: seq=${i.sequenceNumber}, date=${i.invoiceDate}`));

        console.log('\nApril Invoices (Date Objects):', invoices2.length);
        invoices2.forEach(i => console.log(`${i.invoiceNumber}: seq=${i.sequenceNumber}, date=${i.invoiceDate}`));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
checkSequence();
