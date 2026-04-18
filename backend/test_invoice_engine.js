import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Item } from './src/models/item.model.js';
import Customer from './src/models/customer.model.js';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

async function runTest() {
    await mongoose.connect(process.env.MONGODB_URL);
    const item = await Item.findOne({ isActive: true });
    const customer = await Customer.findOne({});

    const testInvData = {
         invoiceNumber: "TEST-GSTR1-" + Date.now(),
         invoiceDate: new Date(),
         customerId: customer._id,
         customerName: customer.customerName || "TEST CUSTOMER PVT LTD",
         customerRegistrationType: "Consumer-B2CL",
         exportCountry: "TestCountry", 
         gstType: "IGST",
         items: [{
             itemId: item._id,
             itemName: item.itemName,
             qty: 5,
             rate: 25000,
             taxableAmount: 125000,
             uqc: item.uqc || item.uom || "NOS",
             hsnCode: item.hsnCode || "8504",
             cessRate: item.cessRate || 12,
             cessAmount: 15000,
             totalAmount: 140000
         }],
         totalTaxableAmount: 125000,
         totalCessAmount: 15000,
         grandTotal: 140000,
         roundedTotal: 140000,
         status: 'Confirmed'
    };

    const inv = await SalesInvoice.create(testInvData);
    
    console.log("🟢 SUCCESS! Invoice created successfully in MongoDB.");
    console.log("--- SNAPSHOT VERIFICATION ---");
    console.log(`Invoice #: ${inv.invoiceNumber}`);
    console.log(`B2CL Classification: ${inv.customerRegistrationType}`);
    console.log(`Export Country: ${inv.exportCountry}`);
    console.log(`Item 1 UQC Frozen: ${inv.items[0].uqc}`);
    console.log(`Item 1 CESS Frozen: ${inv.items[0].cessRate}% (Amt: Rs.${inv.items[0].cessAmount})`);
    
    await SalesInvoice.findByIdAndDelete(inv._id);
    process.exit(0);
}

runTest().catch(console.error);
