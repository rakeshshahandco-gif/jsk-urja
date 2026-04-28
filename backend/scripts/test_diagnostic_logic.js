import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock models
import Customer from '../src/models/customer.model.js';
import { Item } from '../src/models/item.model.js';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { PurchaseOrder } from '../src/models/purchaseOrder.model.js';
import { Task } from '../src/models/task.model.js';
import { WeChatGroup } from '../src/models/weChatGroup.model.js';
import { StockLedger } from '../src/models/stockLedger.model.js';

async function testDiagnostic() {
    console.log('🔌 Connecting to DB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to:', mongoose.connection.name);

    const modelsToCount = [
        { key: 'Customer', model: 'Customer' },
        { key: 'Item', model: 'Item' },
        { key: 'SalesOrder', model: 'SalesOrder' },
        { key: 'SalesInvoice', model: 'SalesInvoice' },
        { key: 'PurchaseOrder', model: 'PurchaseOrder' },
        { key: 'Task', model: 'Task' },
        { key: 'ChinaSourcingGroup', model: 'WeChatGroup' },
        { key: 'StockLedger', model: 'StockLedger' }
    ];

    console.log('📊 Fetching counts...');
    for (const m of modelsToCount) {
        try {
            const count = await mongoose.model(m.model).countDocuments();
            console.log(`- ${m.key}: ${count}`);
        } catch (err) {
            console.error(`❌ Error fetching ${m.key}:`, err.message);
        }
    }

    await mongoose.disconnect();
    console.log('🏁 Done.');
}

testDiagnostic();
