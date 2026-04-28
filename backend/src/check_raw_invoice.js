import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkRaw() {
    try {
        const url = process.env.MONGODB_URL;
        await mongoose.connect(url);
        const inv = await mongoose.connection.collection('salesinvoices').findOne({ invoiceNumber: '26-27/01' });
        console.log('RAW INVOICE 26-27/01:');
        console.log(JSON.stringify(inv, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
checkRaw();
