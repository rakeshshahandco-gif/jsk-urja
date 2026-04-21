import mongoose from 'mongoose';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Voucher } from '../models/voucher.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateFY = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for FY Migration');

        const collections = [
            { model: SalesInvoice, dateField: 'invoiceDate' },
            { model: PurchaseInvoice, dateField: 'invoiceDate' },
            { model: Voucher, dateField: 'date' },
            { model: LedgerEntry, dateField: 'date' },
            { model: StockLedger, dateField: 'date' }
        ];

        for (const col of collections) {
            console.log(`Processing ${col.model.modelName}...`);
            const docs = await col.model.find({
                $or: [
                    { financialYear: { $exists: false } },
                    { financialYear: null },
                    { financialYear: '' }
                ]
            });

            console.log(`Found ${docs.length} documents skipping FY tagging.`);

            let count = 0;
            for (const doc of docs) {
                const date = doc[col.dateField];
                if (date) {
                    doc.financialYear = getFYFromDate(date);
                    await doc.save();
                    count++;
                }
            }
            console.log(`Successfully tagged ${count} documents in ${col.model.modelName}`);
        }

        console.log('Migration Complete');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
};

migrateFY();
