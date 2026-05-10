
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { StockLedger } from './src/models/stockLedger.model.js';
import { Voucher } from './src/models/voucher.model.js';

dotenv.config({ path: './.env' });

const checkData = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        
        const stock = await StockLedger.findOne({}).lean();
        if (stock) {
            console.log('StockLedger Type of date:', typeof stock.date);
        } else {
            console.log('No StockLedger found');
        }

        const voucher = await Voucher.findOne({}).lean();
        if (voucher) {
            console.log('Voucher Type of date:', typeof voucher.date);
        } else {
            console.log('No Voucher found');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
