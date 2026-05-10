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
        console.log('Connected to DB');

        const soIds = [
            '69d0fb18c69569f78d52bc86',
            '69d39b6eee9702029fd3e7c3',
            '69ce16a820badf2f135631d7'
        ].map(id => new mongoose.Types.ObjectId(id));

        const siIds = [
            '69d3713aa24de4781a23649c',
            '69d3a6686d9968f57c54431a'
        ].map(id => new mongoose.Types.ObjectId(id));

        const now = new Date();
        const reason = 'Cleanup by Admin: FY 2026-2027 request';

        // 1. Soft delete Sales Orders
        const soResult = await SalesOrder.updateMany(
            { _id: { $in: soIds } },
            { 
                $set: { 
                    isDeleted: true, 
                    deletedAt: now, 
                    deleteReason: reason,
                    status: 'Cancelled'
                } 
            }
        );
        console.log(`Soft deleted ${soResult.modifiedCount} Sales Orders`);

        // 2. Soft delete Sales Invoices
        // We also find invoices linked to these SO IDs just in case
        const siResult = await SalesInvoice.updateMany(
            { $or: [{ _id: { $in: siIds } }, { soId: { $in: soIds } }] },
            { 
                $set: { 
                    isDeleted: true, 
                    deletedAt: now, 
                    deleteReason: reason,
                    status: 'Cancelled'
                } 
            }
        );
        console.log(`Soft deleted ${siResult.modifiedCount} Sales Invoices`);

        // 3. Handle Accounting (Vouchers and LedgerEntries)
        // Find invoices again to get their numbers
        const invoices = await SalesInvoice.find({ $or: [{ _id: { $in: siIds } }, { soId: { $in: soIds } }] });
        const invNumbers = invoices.map(i => i.invoiceNumber);

        const vResult = await Voucher.updateMany(
            { voucherNo: { $in: invNumbers } },
            { $set: { isDeleted: true, deleteReason: reason } }
        );
        console.log(`Soft deleted ${vResult.modifiedCount} Vouchers`);

        const leResult = await LedgerEntry.updateMany(
            { voucherNo: { $in: invNumbers } },
            { $set: { isDeleted: true, deleteReason: reason } }
        );
        console.log(`Soft deleted ${leResult.modifiedCount} Ledger Entries`);

        // 4. Handle Stock
        const slResult = await StockLedger.updateMany(
            { referenceNo: { $in: invNumbers } },
            { $set: { isDeleted: true, deleteReason: reason } }
        );
        console.log(`Soft deleted ${slResult.modifiedCount} Stock Ledger Entries`);

        console.log('Cleanup completed successfully');

    } catch (err) {
        console.error('Cleanup failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
