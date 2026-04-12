import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { extractSequenceNumber } from '../src/utils/numberingUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { SalesOrder } from '../src/models/salesOrder.model.js';
import { InvoiceSeries } from '../src/models/invoiceSeries.model.js';

(async () => {
    try {
        const uri = process.env.MONGODB_URL;
        console.log('Connecting to DB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        const seriesId = '69aefd438288aa7b5fe1822b'; // The problematic series
        const series = await InvoiceSeries.findById(seriesId);
        if (!series) {
            console.error('Series not found');
            process.exit(1);
        }

        console.log(`Current Series State: ${series.prefix}, Current: ${series.currentNumber}`);

        // Find all orders for this series to find the actual max sequence
        const orders = await SalesOrder.find({ 
            soNumber: { $regex: `^${series.prefix.replace('/', '\\/')}` } 
        });

        let maxSeq = series.currentNumber;
        orders.forEach(so => {
            const seq = extractSequenceNumber(series.prefix, so.soNumber);
            if (seq > maxSeq) maxSeq = seq;
        });

        console.log(`Actual Max Sequence in DB: ${maxSeq}`);

        if (maxSeq > series.currentNumber) {
            series.currentNumber = maxSeq;
            await series.save();
            console.log(`Updated Series currentNumber to ${maxSeq}`);
        } else {
            console.log('Series is already up to date or ahead of DB.');
        }

        await mongoose.disconnect();
        console.log('Heal complete.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
