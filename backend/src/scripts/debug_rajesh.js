import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function debug() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        
        const Employee = mongoose.model('Employee', new mongoose.Schema({ employeeCode: String, employeeName: String }));
        const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, { strict: false }));

        const rajesh = await Employee.findOne({ employeeCode: 'EMP003' }) || await Employee.findOne({ employeeName: /Rajesh/i });
        if (!rajesh) {
            console.log('Rajesh not found');
            return;
        }

        console.log('Employee:', rajesh.employeeName, rajesh._id);

        const records = await Attendance.find({ 
            employee: rajesh._id,
            date: { $gte: moment.utc('2026-03-01').toDate(), $lte: moment.utc('2026-03-31').toDate() }
        }).sort({ date: 1 });

        console.log('Found records:', records.length);
        
        records.forEach(r => {
            console.log(`Date: ${moment(r.date).format('YYYY-MM-DD')} | In: ${r.inTime} | isLate: ${r.isLate} | isLateIn: ${r.isLateIn} | isEarlyIn: ${r.isEarlyIn}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

debug();
