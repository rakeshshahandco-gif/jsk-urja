import mongoose from 'mongoose';
import { InvoiceSeries } from './backend/src/models/invoiceSeries.model.js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk-urja');
    const series = await InvoiceSeries.find();
    console.log('Series GST Status:');
    series.forEach(s => {
        console.log(`${s.seriesName}: gstApplicable=${s.gstApplicable} (type: ${typeof s.gstApplicable})`);
    });
    await mongoose.disconnect();
}
check();
