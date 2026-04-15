import mongoose from 'mongoose';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { FinancialYear } from '../src/models/financialYear.model.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkData() {
  try {
    const mongoUri = process.env.MONGODB_URL;
    console.log('Connecting to:', mongoUri);
    await mongoose.connect(mongoUri);

    const fys = await FinancialYear.find();
    console.log(`Financial Years: ${fys.length}`);
    fys.forEach(f => console.log(` - ${f.name} (ID: ${f._id})`));

    const totalInv = await SalesInvoice.countDocuments();
    console.log(`Total Invoices: ${totalInv}`);
    
    // Check distribution of invoices by financialYear string
    const invByFY = await SalesInvoice.aggregate([
      { $group: { _id: '$financialYear', count: { $sum: 1 } } }
    ]);
    console.log('Invoices by financialYear field:', invByFY);

    const totalOrders = await SalesOrder.countDocuments();
    console.log(`Total Orders: ${totalOrders}`);
    
    // Check distribution of orders by financialYear string
    const ordersByFY = await SalesOrder.aggregate([
      { $group: { _id: '$financialYear', count: { $sum: 1 } } }
    ]);
    console.log('Orders by financialYear field:', ordersByFY);

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkData();
