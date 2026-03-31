import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock the environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models (Need to use absolute paths or proper imports)
// For simplicity in a standalone script, we'll define the schemas we need or use mongoose.model
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { PurchaseOrder } from '../src/models/purchaseOrder.model.js';
import { PurchaseInvoice } from '../src/models/purchaseInvoice.model.js';
import { GRN } from '../src/models/grn.model.js';
import { WorkOrder } from '../src/models/workOrder.model.js';
import { ProductionSheet } from '../src/models/productionSheet.model.js';
import { Voucher } from '../src/models/voucher.model.js';
import { FinancialYear } from '../src/models/financialYear.model.js';

const getFYFromDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed, 0 = Jan, 3 = April

    if (month >= 3) {
        // April to Dec: FY is currentYear-nextYear
        return `${year}-${year + 1}`;
    } else {
        // Jan to March: FY is prevYear-currentYear
        return `${year - 1}-${year}`;
    }
};

const migrate = async () => {
    try {
        console.log('Connecting to database...');
        const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URL not found in environment');
        await mongoose.connect(uri);
        console.log('Connected.');

        const models = [
            { name: 'SalesOrder', model: SalesOrder, dateField: 'orderDate' },
            { name: 'SalesInvoice', model: SalesInvoice, dateField: 'invoiceDate' },
            { name: 'PurchaseOrder', model: PurchaseOrder, dateField: 'orderDate' },
            { name: 'PurchaseInvoice', model: PurchaseInvoice, dateField: 'invoiceDate' },
            { name: 'GRN', model: GRN, dateField: 'grnDate' },
            { name: 'WorkOrder', model: WorkOrder, dateField: 'plannedStart' },
            { name: 'ProductionSheet', model: ProductionSheet, dateField: 'date' },
            { name: 'Voucher', model: Voucher, dateField: 'date' }
        ];

        for (const m of models) {
            console.log(`Migrating ${m.name}...`);
            const records = await m.model.find({ financialYear: { $exists: false } });
            console.log(`Found ${records.length} records to update.`);

            let count = 0;
            for (const doc of records) {
                const date = doc[m.dateField] || doc.createdAt;
                doc.financialYear = getFYFromDate(date);
                await doc.save();
                count++;
                if (count % 100 === 0) console.log(`${m.name}: Updated ${count} records...`);
            }
            console.log(`${m.name}: Successfully migrated ${count} records.`);
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
