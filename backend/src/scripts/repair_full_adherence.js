import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const attendanceSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
}, { strict: false });
const Attendance = mongoose.model('Attendance', attendanceSchema);

const hrSettingsSchema = new mongoose.Schema({}, { strict: false });
const HRSettings = mongoose.model('HRSettings', hrSettingsSchema);

const employeeSchema = new mongoose.Schema({
    shiftType: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' }
}, { strict: false });
const Employee = mongoose.model('Employee', employeeSchema);

const shiftSchema = new mongoose.Schema({
    startTime: String,
    endTime: String,
    graceMinutes: Number
}, { strict: false });
const Shift = mongoose.model('Shift', shiftSchema);

async function repair() {
    try {
        if (!process.env.MONGODB_URL) {
            console.error('MONGODB_URL not found');
            return;
        }
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const settings = await HRSettings.findOne() || { officeStartTime: '10:00', officeEndTime: '18:00', graceMinutes: 10 };
        console.log(`Settings: In=${settings.officeStartTime}, Out=${settings.officeEndTime}`);

        const startDate = new Date('2026-03-01T00:00:00.000Z');
        const endDate = new Date('2026-04-30T23:59:59.999Z');

        const records = await Attendance.find({
            date: { $gte: startDate, $lte: endDate }
        }).populate({
            path: 'employee',
            populate: { path: 'shiftType' }
        });

        console.log(`Checking ${records.length} records...`);
        let updatedCount = 0;

        for (const rec of records) {
            const parsedDate = moment.utc(rec.date).startOf('day');
            
            const shift = rec.employee?.shiftType || { 
                startTime: settings.officeStartTime, 
                endTime: settings.officeEndTime || '18:00', 
                graceMinutes: settings.graceMinutes 
            };
            const shiftStartStr = shift.startTime || settings.officeStartTime || '10:00';
            const shiftEndStr = shift.endTime || settings.officeEndTime || '18:00';
            const grace = shift.graceMinutes !== undefined ? shift.graceMinutes : 10;

            const updateFields = {
                isLate: false, lateMinutes: 0,
                isEarlyIn: false, earlyInMinutes: 0,
                isLateOut: false, lateOutMinutes: 0,
                isEarlyOut: false, earlyOutMinutes: 0
            };

            // Calculate Arrival
            if (rec.inTimeActual) {
                const [sh, sm] = shiftStartStr.split(':');
                const shiftStart = moment.utc(parsedDate).hour(parseInt(sh)).minute(parseInt(sm)).second(0);
                const diffIn = moment(rec.inTimeActual).diff(shiftStart, 'minutes');
                
                if (diffIn > grace) {
                    updateFields.isLate = true;
                    updateFields.lateMinutes = diffIn;
                } else if (diffIn < 0) {
                    updateFields.isEarlyIn = true;
                    updateFields.earlyInMinutes = Math.abs(diffIn);
                }
            }

            // Calculate Departure
            if (rec.outTimeActual) {
                const [eh, em] = shiftEndStr.split(':');
                let shiftEnd = moment.utc(parsedDate).hour(parseInt(eh)).minute(parseInt(em)).second(0);
                
                // Handle night shifts
                const [sh_check] = shiftStartStr.split(':');
                if (parseInt(eh) < parseInt(sh_check)) {
                    shiftEnd = shiftEnd.add(1, 'days');
                }

                const diffOut = moment(rec.outTimeActual).diff(shiftEnd, 'minutes');
                
                if (diffOut < 0) {
                    updateFields.isEarlyOut = true;
                    updateFields.earlyOutMinutes = Math.abs(diffOut);
                } else if (diffOut > 0) {
                    updateFields.isLateOut = true;
                    updateFields.lateOutMinutes = diffOut;
                }
            }

            // Simple update check
            await Attendance.findByIdAndUpdate(rec._id, updateFields);
            updatedCount++;
        }

        console.log(`Repair completed. Processed ${updatedCount} records.`);
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

repair();
