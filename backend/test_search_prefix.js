import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './src/models/customer.model.js';

dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;

async function testSearch() {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB');

        const q = 'RIT';
        const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startsWithRegex = { $regex: '^' + escapedQ, $options: 'i' };

        const filter = {
            isDeleted: { $ne: true },
            $or: [
                { customerName: startsWithRegex },
                { company: startsWithRegex },
                { companyBrand: startsWithRegex },
                { 'contactPersons.name': startsWithRegex },
                { 'contactPersons.mobile': startsWithRegex },
            ],
            status: { $ne: 'inactive' },
        };

        const customers = await Customer.find(filter)
            .sort({ company: 1, customerName: 1 })
            .limit(15)
            .lean();

        console.log(`Search for "${q}" returned ${customers.length} results:`);
        customers.forEach(c => {
            const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};
            console.log(`- ${c.company || c.customerName} (Name: ${c.customerName}, Mobile: ${primaryContact.mobile})`);

            // Validation
            const nameStart = (c.customerName || '').toLowerCase().startsWith(q.toLowerCase());
            const companyStart = (c.company || '').toLowerCase().startsWith(q.toLowerCase());
            const mobileStart = (primaryContact.mobile || '').startsWith(q);

            if (!nameStart && !companyStart && !mobileStart) {
                console.log('  ⚠️ WARNING: This result does not seem to match prefix!');
            }
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

testSearch();
