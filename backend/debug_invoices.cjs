const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const siSchema = new mongoose.Schema({}, { strict: false, collection: 'salesinvoices' });
const SalesInvoice = mongoose.model('SalesInvoice', siSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const count = await SalesInvoice.countDocuments();
        console.log('Total invoices:', count);
        const sample = await SalesInvoice.findOne();
        console.log('Sample invoice:', JSON.stringify(sample, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
