import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

import { SalesOrder } from '../src/models/salesOrder.model.js';
import Customer from '../src/models/customer.model.js';
import { Item } from '../src/models/item.model.js';
import { User } from '../src/models/user.model.js';

async function generateSampleData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('Connected.');

        const admin = await User.findOne();
        if (!admin) {
            console.log('No user found');
            return;
        }

        const customers = await Customer.find().limit(3);
        const items = await Item.find().limit(5);

        if (customers.length === 0 || items.length === 0) {
            console.log('Not enough customers or items to generate orders');
            return;
        }

        console.log('Generating 5 Sample Sales Orders...');

        const year = new Date().getFullYear();
        
        for (let i = 1; i <= 5; i++) {
            const customer = customers[i % customers.length];
            const item = items[i % items.length];
            
            const qty = Math.floor(Math.random() * 10) + 1;
            const rate = item.salesPrice || 100;
            const amount = qty * rate;
            const cgst = amount * 0.09;
            const sgst = amount * 0.09;
            const grandTotal = amount + cgst + sgst;

            const soNumber = `SO-${year}-${String(i).padStart(5, '0')}`;

            await SalesOrder.create({
                soNumber,
                soDate: new Date(),
                customerId: customer._id,
                customerName: customer.customerName || customer.company || 'Sample Customer',
                customerCode: customer.customerCode || `CUST-${i}`,
                billingAddress: customer.billingAddress || customer.address || 'Sample Address',
                shippingAddress: customer.shippingAddress || customer.address || 'Sample Address',
                orderCategory: 'Order',
                status: 'Confirmed',
                items: [{
                    itemId: item._id,
                    itemCode: item.itemCode,
                    itemName: item.itemName,
                    hsnCode: item.hsnCode || '8536',
                    qty,
                    rate,
                    amount,
                    gstRate: 18,
                    taxableAmount: amount,
                    cgstRate: 9,
                    sgstRate: 9,
                    cgstAmount: cgst,
                    sgstAmount: sgst,
                    igstRate: 0,
                    igstAmount: 0,
                    totalAmount: grandTotal
                }],
                totalQty: qty,
                totalAmount: amount,
                totalCgst: cgst,
                totalSgst: sgst,
                totalIgst: 0,
                totalGst: cgst + sgst,
                grandTotal: grandTotal,
                roundedTotal: Math.round(grandTotal),
                roundOff: Math.round(grandTotal) - grandTotal,
                amountInWords: "Sample Amount Only",
                createdBy: admin._id
            });
            console.log(`Created ${soNumber}`);
        }

        console.log('Successfully restored dummy Sales Orders!');
    } catch (error) {
        console.error('Error generating data:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

generateSampleData();
