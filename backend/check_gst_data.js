import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function run() {
    console.log('🚀 Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected.');

        const db = mongoose.connection.db;

        console.log('\n--- Checking Recently Updated Customers with GST ---');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2); 

        const recentCustomers = await db.collection('customers').find({
            gstNumber: { $exists: true, $ne: '' },
            updatedAt: { $gte: yesterday }
        }).sort({ updatedAt: -1 }).toArray();

        if (recentCustomers.length === 0) {
            console.log('No customers found with GST numbers updated recently.');
        } else {
            recentCustomers.forEach(c => {
                console.log(`Cust: ${c.company || c.customerName}, GST: ${c.gstNumber}, Updated: ${c.updatedAt}, Deleted: ${c.isDeleted}`);
            });
        }

        console.log('\n--- Checking Recently Updated Suppliers with GST ---');
        const recentSuppliers = await db.collection('suppliers').find({
            gstNumber: { $exists: true, $ne: '' },
            updatedAt: { $gte: yesterday }
        }).sort({ updatedAt: -1 }).toArray();

        if (recentSuppliers.length === 0) {
            console.log('No suppliers found with GST numbers updated recently.');
        } else {
            recentSuppliers.forEach(s => {
                console.log(`Supp: ${s.supplierName}, GST: ${s.gstNumber}, Updated: ${s.updatedAt}, Active: ${s.isActive}`);
            });
        }

        console.log('\n--- Checking Deleted Customers with GST ---');
        const deletedWithGst = await db.collection('customers').find({
            isDeleted: true,
            gstNumber: { $exists: true, $ne: '' }
        }).toArray();

        if (deletedWithGst.length > 0) {
            console.log(`Found ${deletedWithGst.length} deleted customers with GST numbers.`);
            deletedWithGst.forEach(c => {
                console.log(`Deleted Cust: ${c.company || c.customerName}, GST: ${c.gstNumber}`);
            });
        } else {
            console.log('No deleted customers with GST numbers found.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

run();
