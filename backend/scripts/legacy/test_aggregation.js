
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';
import { BOM } from './src/models/bom.model.js';
import { Item } from './src/models/item.model.js';
import moment from 'moment';

dotenv.config({ path: './.env' });

const testAggregation = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const startDate = '2026-04-01';
        const endDate = '2026-04-30';

        const filters = {
            invoiceDate: {
                $gte: moment(startDate).startOf('day').toDate(),
                $lte: moment(endDate).endOf('day').toDate()
            }
        };

        console.log('Using filters:', JSON.stringify(filters));

        const salesData = await SalesInvoice.aggregate([
            { $match: filters },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.itemId',
                    itemCode: { $first: '$items.itemCode' },
                    itemName: { $first: '$items.itemName' },
                    totalQty: { $sum: '$items.qty' },
                    totalRevenue: { $sum: '$items.taxableAmount' },
                    avgRate: { $avg: '$items.rate' },
                    uom: { $first: '$items.uom' }
                }
            }
        ]);

        console.log('Aggregated Sales Data Count:', salesData.length);
        if (salesData.length > 0) {
            console.log('First Item:', JSON.stringify(salesData[0], null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testAggregation();
