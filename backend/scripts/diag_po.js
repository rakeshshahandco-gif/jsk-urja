import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { PurchaseOrder } from '../src/models/purchaseOrder.model.js';
import { Supplier } from '../src/models/supplier.model.js';
import { User } from '../src/models/user.model.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.');

        const query = {};
        const pos = await PurchaseOrder.find(query)
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('supplierId', 'supplierName supplierCode')
            .populate('createdBy', 'name mobile');
        
        console.log('POS found:', pos.length);
        if (pos.length > 0) {
            console.log('First PO:', pos[0].poNumber);
        } else {
            console.log('No POs in database.');
        }

    } catch (err) {
        console.error('DIAGNOSTIC ERROR:', err);
    } finally {
        await mongoose.disconnect();
    }
}
run();
