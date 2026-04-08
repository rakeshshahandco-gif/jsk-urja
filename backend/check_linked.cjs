const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const siSchema = new mongoose.Schema({}, { strict: false, collection: 'salesinvoices' });
const vSchema = new mongoose.Schema({}, { strict: false, collection: 'vouchers' });
const lSchema = new mongoose.Schema({}, { strict: false, collection: 'ledgerentries' });
const slSchema = new mongoose.Schema({}, { strict: false, collection: 'stockledgers' });

const SalesInvoice = mongoose.model('SalesInvoice', siSchema);
const Voucher = mongoose.model('Voucher', vSchema);
const LedgerEntry = mongoose.model('LedgerEntry', lSchema);
const StockLedger = mongoose.model('StockLedger', slSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const siIds = [
            new mongoose.Types.ObjectId('69d3713aa24de4781a23649c'),
            new mongoose.Types.ObjectId('69d3a6686d9968f57c54431a')
        ];

        const invoices = await SalesInvoice.find({ _id: { $in: siIds } });
        const vouchers = await Voucher.find({ referenceId: { $in: siIds } });
        const ledgerEntries = await LedgerEntry.find({ referenceId: { $in: siIds } });
        const stockLedger = await StockLedger.find({ referenceId: { $in: siIds } });

        console.log(JSON.stringify({
            invoices: invoices.map(i => ({ _id: i._id, invoiceNumber: i.invoiceNumber, status: i.status })),
            vouchers: vouchers.map(v => ({ _id: v._id, voucherNumber: v.voucherNumber, type: v.type })),
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
