const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const soSchema = new mongoose.Schema({}, { strict: false, collection: 'salesorders' });
const siSchema = new mongoose.Schema({}, { strict: false, collection: 'salesinvoices' });
const vSchema = new mongoose.Schema({}, { strict: false, collection: 'vouchers' });
const lSchema = new mongoose.Schema({}, { strict: false, collection: 'ledgerentries' });
const slSchema = new mongoose.Schema({}, { strict: false, collection: 'stockledgers' });

const SalesOrder = mongoose.model('SalesOrder', soSchema);
const SalesInvoice = mongoose.model('SalesInvoice', siSchema);
const Voucher = mongoose.model('Voucher', vSchema);
const LedgerEntry = mongoose.model('LedgerEntry', lSchema);
const StockLedger = mongoose.model('StockLedger', slSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const orders = await SalesOrder.find({ soNumber: { $in: ['26-27/02', '26-0700251', 'SO-2026-00240'] } });
        const soIds = orders.map(o => o._id);

        const invoices = await SalesInvoice.find({ $or: [{ soId: { $in: soIds } }, { soNumber: { $in: ['26-27/02', '26-0700251', 'SO-2026-00240'] } }] });
        const siIds = invoices.map(i => i._id);

        const vouchers = await Voucher.find({ $or: [{ referenceId: { $in: siIds } }, { referenceId: { $in: soIds } }] });
        const ledgerEntries = await LedgerEntry.find({ $or: [{ referenceId: { $in: siIds } }, { referenceId: { $in: soIds } }] });
        const stockLedger = await StockLedger.find({ $or: [{ referenceId: { $in: siIds } }, { referenceId: { $in: soIds } }] });

        console.log(JSON.stringify({
            orders: orders.map(o => ({ _id: o._id, soNumber: o.soNumber, status: o.status })),
            invoices: invoices.map(i => ({ _id: i._id, invoiceNumber: i.invoiceNumber, status: i.status })),
            vouchers: vouchers.map(v => ({ _id: v._id, voucherNumber: v.voucherNumber })),
            ledgerEntriesCount: ledgerEntries.length,
            stockLedgerCount: stockLedger.length
        }, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
