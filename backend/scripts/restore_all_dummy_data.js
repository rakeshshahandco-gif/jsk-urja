import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const MONGODB_URL = process.env.MONGODB_URL;

import { SalesOrder } from '../src/models/salesOrder.model.js';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { PurchaseOrder } from '../src/models/purchaseOrder.model.js';
import { PurchaseInvoice } from '../src/models/purchaseInvoice.model.js';
import { GRN } from '../src/models/grn.model.js';
import Customer from '../src/models/customer.model.js';
import { Supplier } from '../src/models/supplier.model.js';
import { Item } from '../src/models/item.model.js';
import { User } from '../src/models/user.model.js';

function getRandomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function generateAllDummyData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('Connected.');

        const admin = await User.findOne();
        if (!admin) return console.log('No user found');

        const customers = await Customer.find().limit(3);
        const suppliers = await Supplier.find().limit(3);
        const items = await Item.find().limit(5);

        if (customers.length === 0 || suppliers.length === 0 || items.length === 0) {
            return console.log('Not enough base records (customers, suppliers, items)');
        }

        const year = new Date().getFullYear();
        const start = new Date(year, 0, 1);
        const end = new Date(); // today

        console.log('Generating Sales Invoices (with previous dates)...');
        for (let i = 21; i <= 25; i++) {
            const customer = customers[i % customers.length];
            const item = items[i % items.length];
            const qty = 5;
            const rate = item.salesPrice || 100;
            const amount = qty * rate;
            const cgst = amount * 0.09;
            const sgst = amount * 0.09;
            const grandTotal = amount + cgst + sgst;

            await SalesInvoice.create({
                invoiceNumber: `INV-${year}-${String(i).padStart(5, '0')}`,
                invoiceDate: getRandomDate(start, end),
                customerId: customer._id,
                customerName: customer.customerName || customer.company || 'Sample Customer',
                customerCode: customer.customerCode || `CUST-${i}`,
                billingAddress: customer.billingAddress || customer.address || 'Sample Address',
                shippingAddress: customer.shippingAddress || customer.address || 'Sample Address',
                status: 'Confirmed',
                paymentType: 'Credit',
                paymentStatus: 'Unpaid',
                items: [{
                    itemId: item._id,
                    itemCode: item.itemCode,
                    itemName: item.itemName,
                    qty, rate, amount, 
                    gstRate: 18, taxableAmount: amount,
                    cgstRate: 9, sgstRate: 9, cgstAmount: cgst, sgstAmount: sgst,
                    igstRate: 0, igstAmount: 0, totalAmount: grandTotal
                }],
                totalQty: qty, totalAmount: amount,
                totalCgst: cgst, totalSgst: sgst, totalIgst: 0, totalGst: cgst + sgst,
                grandTotal: grandTotal, roundedTotal: Math.round(grandTotal), roundOff: Math.round(grandTotal) - grandTotal,
                amountInWords: "Sample Amount",
                createdBy: admin._id
            });
        }

        console.log('Generating Purchase Orders & Invoices (with previous dates)...');
        for (let i = 21; i <= 25; i++) {
            const supplier = suppliers[i % suppliers.length];
            const item = items[i % items.length];
            const qty = 50;
            const rate = item.purchasePrice || 80;
            const amount = qty * rate;
            const cgst = amount * 0.09;
            const sgst = amount * 0.09;
            const grandTotal = amount + cgst + sgst;
            const date = getRandomDate(start, end);

            // Purchase Order
            const po = await PurchaseOrder.create({
                poNumber: `PO-${year}-${String(i).padStart(5, '0')}`,
                poDate: date,
                supplierId: supplier._id,
                supplierName: supplier.supplierName || 'Sample Supplier',
                supplierCode: supplier.supplierCode || `SUP-${i}`,
                items: [{
                    itemId: item._id, itemCode: item.itemCode, itemName: item.itemName,
                    orderedQty: qty, rate, amount,
                    gstRate: 18, taxableAmount: amount,
                    cgstRate: 9, sgstRate: 9, cgstAmount: cgst, sgstAmount: sgst,
                    igstRate: 0, igstAmount: 0, totalAmount: grandTotal
                }],
                totalQty: qty, totalAmount: amount,
                totalCgst: cgst, totalSgst: sgst, totalIgst: 0, totalGst: cgst + sgst,
                grandTotal: grandTotal, roundedTotal: Math.round(grandTotal), roundOff: Math.round(grandTotal) - grandTotal,
                amountInWords: "Sample Amount",
                status: 'Ordered',
                createdBy: admin._id
            });

            // GRN
            const grn = await GRN.create({
                grnNumber: `GRN-${year}-${String(i).padStart(5, '0')}`,
                grnDate: new Date(date.getTime() + 86400000), // 1 day after PO
                supplierId: supplier._id,
                supplierName: supplier.supplierName || 'Sample Supplier',
                supplierCode: supplier.supplierCode || `SUP-${i}`,
                poId: po._id,
                poNumber: po.poNumber,
                items: [{
                    itemId: item._id, itemCode: item.itemCode, itemName: item.itemName,
                    orderedQty: qty, previouslyReceivedQty: 0, pendingQty: 0, receivedQty: qty, invoicedQty: qty,
                    rate, amount,
                    qcStatus: 'Accepted',
                    gstRate: 18, taxableAmount: amount,
                    cgstRate: 9, sgstRate: 9, cgstAmount: cgst, sgstAmount: sgst,
                    igstRate: 0, igstAmount: 0, totalAmount: grandTotal
                }],
                totalQty: qty, totalAmount: amount,
                totalCgst: cgst, totalSgst: sgst, totalIgst: 0, totalGst: cgst + sgst,
                grandTotal: grandTotal, roundedTotal: Math.round(grandTotal), roundOff: Math.round(grandTotal) - grandTotal,
                amountInWords: "Sample Amount",
                status: 'Confirmed',
                createdBy: admin._id
            });

            // Purchase Invoice
            await PurchaseInvoice.create({
                invoiceNumber: `PI-${year}-${String(i).padStart(5, '0')}`,
                supplierInvoiceNo: `SUP-INV-${i}`,
                invoiceDate: new Date(date.getTime() + 172800000), // 2 days after PO
                supplierId: supplier._id,
                supplierName: supplier.supplierName || 'Sample Supplier',
                supplierCode: supplier.supplierCode || `SUP-${i}`,
                poId: po._id, poNumber: po.poNumber,
                grnId: grn._id, grnNumber: grn.grnNumber,
                items: [{
                    itemId: item._id, itemCode: item.itemCode, itemName: item.itemName,
                    qty, rate, amount,
                    gstRate: 18, taxableAmount: amount,
                    cgstRate: 9, sgstRate: 9, cgstAmount: cgst, sgstAmount: sgst,
                    igstRate: 0, igstAmount: 0, totalAmount: grandTotal
                }],
                totalQty: qty, totalAmount: amount,
                totalCgst: cgst, totalSgst: sgst, totalIgst: 0, totalGst: cgst + sgst,
                grandTotal: grandTotal, roundedTotal: Math.round(grandTotal), roundOff: Math.round(grandTotal) - grandTotal,
                amountInWords: "Sample Amount",
                status: 'Confirmed', paymentStatus: 'Unpaid',
                createdBy: admin._id
            });
        }

        console.log('Successfully generated previous dummy data!');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
    }
}

generateAllDummyData();
