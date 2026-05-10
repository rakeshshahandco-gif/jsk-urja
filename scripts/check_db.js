import mongoose from 'mongoose';
import Customer from './backend/src/models/customer.model.js';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

async function checkDatabase() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB');

    const names = ['ABC CORP', 'SATIESH SIR', 'TEST MAH'];
    const customers = await Customer.find({ 
        $or: [
            { company: { $in: names.map(n => new RegExp(n, 'i')) } },
            { customerName: { $in: names.map(n => new RegExp(n, 'i')) } }
        ]
    });

    console.log('🔍 Customers Found:');
    customers.forEach(c => {
        console.log(`- ${c.company || c.customerName} | GST: ${c.gstNumber || 'EMPTY'} | Status: ${c.status}`);
    });

    await mongoose.disconnect();
}

checkDatabase().catch(console.error);
