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
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
}, { strict: false });

const Attendance = mongoose.model('Attendance', attendanceSchema);

async function check() {
    try {
        if (!process.env.MONGODB_URL) {
            console.error('MONGODB_URL not found in .env');
            return;
        }
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const totalLate = await Attendance.countDocuments({ isLate: true });
        console.log('Total Late records in DB:', totalLate);

        const marchStart = new Date('2026-03-01T00:00:00.000Z');
        const marchEnd = new Date('2026-03-31T23:59:59.999Z');

        const marchLate = await Attendance.countDocuments({ 
            isLate: true, 
            date: { $gte: marchStart, $lte: marchEnd } 
        });
        console.log('Late records in March 2026:', marchLate);

        const anyMarch = await Attendance.countDocuments({
            date: { $gte: marchStart, $lte: marchEnd }
        });
        console.log('Total Attendance records in March 2026:', anyMarch);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

check();
