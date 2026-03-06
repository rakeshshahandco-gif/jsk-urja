import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const workOrderSchema = new mongoose.Schema({
    woNumber: String
}, { strict: false });

const WorkOrder = mongoose.model('WorkOrder', workOrderSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const wos = await WorkOrder.find({}, 'woNumber').sort({ woNumber: -1 }).limit(20);
        console.log('Last 20 Work Orders (by woNumber desc):');
        wos.forEach(wo => console.log(wo.woNumber));

        const count = await WorkOrder.countDocuments();
        console.log('Total Work Orders:', count);

        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

check();
