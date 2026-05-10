const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const db = mongoose.connection.db;
        
        const customer = await db.collection('customers').findOne({ customerCode: 'CU546' });
        if (!customer) {
            console.log('Customer not found');
            return;
        }

        const cid = customer._id;
        const soCount = await db.collection('salesorders').countDocuments({ customerId: cid, isDeleted: { $ne: true } });
        const siCount = await db.collection('salesinvoices').countDocuments({ customerId: cid, isDeleted: { $ne: true } });
        const leCount = await db.collection('ledgerentries').countDocuments({ $or: [{ referenceId: cid }, { contactId: cid }] });
        const groupCount = await db.collection('groups').countDocuments({ 'members.customerId': cid });

        console.log(JSON.stringify({
            customer: { _id: customer._id, name: customer.companyName || customer.customerName, code: customer.customerCode },
            stats: { soCount, siCount, leCount, groupCount }
        }, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
