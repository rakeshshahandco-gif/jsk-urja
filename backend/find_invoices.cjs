const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const siSchema = new mongoose.Schema({}, { strict: false, collection: 'salesinvoices' });
const SalesInvoice = mongoose.model('SalesInvoice', siSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const invoices = await SalesInvoice.find({ financialYear: '2026-2027' });
        console.log(JSON.stringify(invoices.map(i => ({ _id: i._id, invoiceNumber: i.invoiceNumber, soNumber: i.soNumber, status: i.status })), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
