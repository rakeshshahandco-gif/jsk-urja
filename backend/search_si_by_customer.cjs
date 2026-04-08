const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const si = await mongoose.connection.db.collection('salesinvoices').find({ customerName: 'DYNAMO & CO' }).toArray();
        console.log(JSON.stringify(si.map(i => ({ _id: i._id, invoiceNumber: i.invoiceNumber, soNumber: i.soNumber, financialYear: i.financialYear })), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
