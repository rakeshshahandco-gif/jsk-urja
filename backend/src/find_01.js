import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function find01() {
    try {
        const url = process.env.MONGODB_URL;
        await mongoose.connect(url);
        const inv = await mongoose.connection.collection('salesinvoices').findOne({ invoiceNumber: '26-27/01' });
        if (inv) {
            console.log('FOUND 26-27/01:');
            console.log(`Date: ${inv.invoiceDate} (type: ${typeof inv.invoiceDate})`);
            console.log(`Seq: ${inv.sequenceNumber}`);
            console.log(`Status: ${inv.status}`);
            console.log(`SeriesId: ${inv.seriesId}`);
        } else {
            console.log('26-27/01 NOT FOUND IN DB');
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
find01();
