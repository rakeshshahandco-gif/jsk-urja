import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const attendanceSchema = new mongoose.Schema({}, { strict: false });
        const Attendance = mongoose.model('Attendance', attendanceSchema);

        const records = await Attendance.find({ 
            date: { $gte: new Date('2026-03-01'), $lte: new Date('2026-03-31') }
        }).limit(5);

        console.log(JSON.stringify(records, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

check();
