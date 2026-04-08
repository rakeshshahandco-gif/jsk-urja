const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const soSchema = new mongoose.Schema({}, { strict: false, collection: 'salesorders' });
const siSchema = new mongoose.Schema({}, { strict: false, collection: 'salesinvoices' });
const vSchema = new mongoose.Schema({}, { strict: false, collection: 'vouchers' });
const leSchema = new mongoose.Schema({}, { strict: false, collection: 'ledgerentries' });
const slSchema = new mongoose.Schema({}, { strict: false, collection: 'stockledgers' });

const SalesOrder = mongoose.model('SalesOrder', soSchema);
const SalesInvoice = mongoose.model('SalesInvoice', siSchema);
const Voucher = mongoose.model('Voucher', vSchema);
const LedgerEntry = mongoose.model('LedgerEntry', leSchema);
const StockLedger = mongoose.model('StockLedger', slSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const soNumbers = ['26-27/02', '26-0700251', 'SO-2026-00240'];
        const orders = await SalesOrder.find({ soNumber: { $in: soNumbers } });
        const soIds = orders.map(o => o._id);
        const invoiceIds = orders.map(o => o.invoiceId).filter(id => id);

        const invoices = await SalesInvoice.find({ $or: [{ _id: { $in: invoiceIds } }, { soId: { $in: soIds } }, { soNumber: { $in: soNumbers } }] });
        const invNumbers = invoices.map(i => i.invoiceNumber);
        const allInvIds = invoices.map(i => i._id);

        const vouchers = await Voucher.find({ $or: [{ voucherNo: { $in: invNumbers } }, { referenceId: { $in: allInvIds } }] });
        const ledgerEntries = await LedgerEntry.find({ $or: [{ voucherNo: { $in: invNumbers } }, { referenceId: { $in: allInvIds } }] });
        const stockEntries = await StockLedger.find({ $or: [{ referenceNo: { $in: invNumbers } }, { referenceId: { $in: allInvIds } }, { referenceId: { $in: soIds } }] });

        console.log(JSON.stringify({
            orders: orders.map(o => ({ soNumber: o.soNumber, status: o.status })),
            invoices: invoices.map(i => ({ invoiceNumber: i.invoiceNumber, status: i.status })),
            vouchers: vouchers.map(v => ({ voucherNumber: v.voucherNo || v.voucherNumber, type: v.type })),
            ledgerEntriesCount: ledgerEntries.length,
            stockEntriesCount: stockEntries.length
        }, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
