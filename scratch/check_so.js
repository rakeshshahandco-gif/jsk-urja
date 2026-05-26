
import mongoose from 'mongoose';
import { SalesOrder } from './backend/src/models/salesOrder.model.js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const so = await SalesOrder.findById('69e9ddb7de240191d060e0fb');
    console.log('SO found:', !!so);
    if (so) {
        console.log('customerId:', so.customerId);
        console.log('customerName:', so.customerName);
        console.log('items count:', so.items.length);
    }
    await mongoose.disconnect();
}
check();
