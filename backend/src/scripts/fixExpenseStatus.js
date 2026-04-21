import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const voucherSchema = new mongoose.Schema({
    nature: String,
    expenseType: String,
    paymentStatus: String,
    paidAmount: Number,
    grandTotal: Number,
    totalAmount: Number
}, { strict: false });

const Voucher = mongoose.model('Voucher', voucherSchema);

async function run() {
    try {
        console.log('Connecting to DB...');
        if (!process.env.MONGODB_URL) {
            console.error('MONGODB_URL not found in .env');
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected.');

        const filter = {
            nature: 'Expense',
            expenseType: 'Credit',
            paymentStatus: 'Paid'
        };

        const vouchers = await Voucher.find(filter);
        console.log(`Found ${vouchers.length} vouchers to fix.`);

        let fixed = 0;
        for (const v of vouchers) {
            v.paymentStatus = 'Unpaid';
            v.paidAmount = 0;
            await v.save();
            fixed++;
            console.log(`Fixed Voucher: ${v.voucherNo || v._id}`);
        }

        console.log(`Successfully fixed ${fixed} vouchers.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
