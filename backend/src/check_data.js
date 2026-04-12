import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const attendanceSchema = new mongoose.Schema({
    date: Date,
    isLate: Boolean,
    inTime: String,
    lateMinutes: Number,
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
}, { strict: false });

const Attendance = mongoose.model('Attendance', attendanceSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const marchStart = new Date('2026-03-01T00:00:00.000Z');
        const marchEnd = new Date('2026-03-31T23:59:59.999Z');

        const records = await Attendance.find({
            date: { $gte: marchStart, $lte: marchEnd },
            inTime: { $ne: '' }
        }).limit(20);

        console.log('Sample Attendance Records (March 2026):');
        records.forEach(r => {
            console.log(`Date: ${r.date.toISOString()}, In: ${r.inTime}, Late: ${r.isLate}, LateMins: ${r.lateMinutes}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

check();
