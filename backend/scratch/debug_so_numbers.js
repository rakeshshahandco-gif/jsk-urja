import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { SalesOrder } from '../src/models/salesOrder.model.js';
import { InvoiceSeries } from '../src/models/invoiceSeries.model.js';

(async () => {
    try {
        const uri = process.env.MONGODB_URL;
        console.log('Connecting to Mango Atlas...');
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const lastSOs = await SalesOrder.find({ isDeleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .limit(10);
        
        console.log('\n--- Last 10 Sales Orders ---');
        lastSOs.forEach(so => {
            console.log(`ID: ${so._id}, Number: ${so.soNumber}, Seq: ${so.sequenceNumber}, FY: ${so.financialYear}`);
        });

        const series = await InvoiceSeries.find({ isActive: true });
        console.log('\n--- Active Invoice Series ---');
        series.forEach(s => {
            console.log(`ID: ${s._id}, Prefix: ${s.prefix}, Current: ${s.currentNumber}, Start: ${s.startNumber}, FY: ${s.financialYear}`);
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
