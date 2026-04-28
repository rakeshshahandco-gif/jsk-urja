import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkSeries() {
    try {
        const url = process.env.MONGODB_URL;
        await mongoose.connect(url);
        const series = await mongoose.connection.collection('salesinvoiceseries').find({}).toArray();
        console.log('Series count:', series.length);
        series.forEach(s => {
            console.log(`Prefix: ${s.prefix}, isEst: ${s.isEstimate}, gstApp: ${s.gstApplicable}, docType: ${s.documentType}`);
        });
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
checkSeries();
