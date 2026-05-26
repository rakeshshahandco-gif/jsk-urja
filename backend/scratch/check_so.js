
import mongoose from 'mongoose';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const so = await SalesOrder.findById('69e9ddb7de240191d060e0fb');
        console.log('SO found:', !!so);
        if (so) {
            console.log('customerId:', so.customerId);
            console.log('customerName:', so.customerName);
            console.log('items count:', so.items.length);
        } else {
            console.log('No SO found for ID: 69e9ddb7de240191d060e0fb');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
