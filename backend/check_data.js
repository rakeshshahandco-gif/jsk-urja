import mongoose from 'mongoose';
import Customer from './src/models/customer.model.js';

const dbURI = 'mongodb://localhost:27017/crm'; // Assuming the DB name is crm based on context

async function checkCustomer() {
    try {
        await mongoose.connect(dbURI);
        console.log('Connected to MongoDB');

        // Search for "HOME" as typed in the screenshot
        const customer = await Customer.findOne({
            $or: [
                { customerName: /HOME/i },
                { company: /HOME/i }
            ]
        }).lean();

        if (customer) {
            console.log('Customer Found:');
            console.log(JSON.stringify(customer, null, 2));
        } else {
            console.log('No customer found matching "HOME"');
            // List a few customers to see the structure
            const others = await Customer.find().limit(5).lean();
            console.log('Sample Customers:');
            console.log(JSON.stringify(others, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkCustomer();
