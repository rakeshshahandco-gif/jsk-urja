const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const soSchema = new mongoose.Schema({}, { strict: false, collection: 'salesorders' });
const SalesOrder = mongoose.model('SalesOrder', soSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const orders = await SalesOrder.find({ soNumber: { $in: ['26-27/02', '26-0700251', 'SO-2026-00240'] } });
        console.log(JSON.stringify(orders.map(o => ({ 
            _id: o._id, 
            soNumber: o.soNumber, 
            status: o.status, 
            financialYear: o.financialYear,
            invoiceId: o.invoiceId
        })), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
