import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const attendanceSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
}, { strict: false });
const Attendance = mongoose.model('Attendance', attendanceSchema);

const employeeSchema = new mongoose.Schema({
    shiftType: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' }
}, { strict: false });
const Employee = mongoose.model('Employee', employeeSchema);

const shiftSchema = new mongoose.Schema({}, { strict: false });
const Shift = mongoose.model('Shift', shiftSchema);

const HRSettings = mongoose.model('HRSettings', new mongoose.Schema({}, { strict: false }));

async function repair() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected');

        const settings = await HRSettings.findOne() || { officeStartTime: '10:00', officeEndTime: '18:00', graceMinutes: 10 };
        
        const records = await Attendance.find({
            date: { $gte: new Date('2026-03-01'), $lte: new Date('2026-04-30') }
        }).populate({
            path: 'employee',
            populate: { path: 'shiftType' }
        });

        console.log(`Processing ${records.length} records...`);

        for (const rec of records) {
            const parsedDate = moment.utc(rec.date).startOf('day');
            
            const shift = rec.employee?.shiftType || { 
                startTime: settings.officeStartTime || '10:00', 
                endTime: settings.officeEndTime || '18:00', 
                graceMinutes: settings.graceMinutes || 10 
            };
            
            const shiftStartStr = shift.startTime || '10:00';
            const shiftEndStr = shift.endTime || '18:00';
            const grace = (shift.graceMinutes !== undefined) ? shift.graceMinutes : 10;

            let isLateIn = false, lateInMinutes = 0;
            let isEarlyIn = false, earlyInMinutes = 0;
            let isLateOut = false, lateOutMinutes = 0;
            let isEarlyOut = false, earlyOutMinutes = 0;

            if (rec.inTimeActual) {
                const [sh, sm] = shiftStartStr.split(':');
                const shiftStart = moment.utc(parsedDate).hour(parseInt(sh)).minute(parseInt(sm)).second(0);
                // USE UTC MOMENT FOR COMPARISON
                const actualIn = moment.utc(rec.inTimeActual);
                const diffIn = actualIn.diff(shiftStart, 'minutes');
                
                if (diffIn > grace) {
                    isLateIn = true;
                    lateInMinutes = diffIn;
                } else if (diffIn < 0) {
                    isEarlyIn = true;
                    earlyInMinutes = Math.abs(diffIn);
                }
            }

            if (rec.outTimeActual) {
                const [eh, em] = shiftEndStr.split(':');
                let shiftEnd = moment.utc(parsedDate).hour(parseInt(eh)).minute(parseInt(em)).second(0);
                
                const [sh_check] = shiftStartStr.split(':');
                if (parseInt(eh) < parseInt(sh_check)) {
                    shiftEnd = shiftEnd.add(1, 'days');
                }

                const actualOut = moment.utc(rec.outTimeActual);
                const diffOut = actualOut.diff(shiftEnd, 'minutes');
                
                if (diffOut < 0) {
                    isEarlyOut = true;
                    earlyOutMinutes = Math.abs(diffOut);
                } else if (diffOut > 0) {
                    isLateOut = true;
                    lateOutMinutes = diffOut;
                }
            }

            // UPDATE ALL FIELDS
            await Attendance.findByIdAndUpdate(rec._id, {
                isLate: isLateIn,
                lateMinutes: lateInMinutes,
                isLateIn,
                lateInMinutes,
                isEarlyIn,
                earlyInMinutes,
                isLateOut,
                lateOutMinutes,
                isEarlyOut,
                earlyOutMinutes
            });
        }

        console.log('Done');
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

repair();
