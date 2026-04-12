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

        const settings = await HRSettings.findOne() || { officeStartTime: '10:00', graceMinutes: 10 };
        console.log(`Using Settings: Start=${settings.officeStartTime}, Grace=${settings.graceMinutes}`);

        const marchStart = new Date('2026-03-01T00:00:00.000Z');
        const marchEnd = new Date('2026-03-31T23:59:59.999Z');

        const records = await Attendance.find({
            date: { $gte: marchStart, $lte: marchEnd },
            inTime: { $ne: '' }
        }).populate({
            path: 'employee',
            populate: { path: 'shiftType' }
        });

        console.log(`Found ${records.length} records to check for March 2026...`);

        let updatedCount = 0;

        for (const rec of records) {
            const parsedDate = moment.utc(rec.date).startOf('day');
            const inTimeStr = rec.inTime;
            
            // Robust parsing logic (same as the fix)
            const parseTimeInternal = (input, baseDate) => {
                let mTime;
                if (input instanceof Date) {
                    mTime = moment.utc(input);
                } else {
                    const str = input.toString();
                    mTime = moment.utc(str, ['HH:mm', 'HH:mm:ss', 'hh:mm A', 'hh:mm:ss A', 'h:mm A', 'H:mm', 'YYYY-MM-DDTHH:mm:ss.SSSZ']);
                    if (!mTime.isValid()) {
                        const match = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
                        if (match) {
                            const res = moment.utc(baseDate);
                            res.hour(parseInt(match[1]));
                            res.minute(parseInt(match[2]));
                            res.second(parseInt(match[3] || 0));
                            return res.toDate();
                        }
                    }
                }
                if (!mTime.isValid()) return null;
                const final = moment.utc(baseDate);
                final.hour(mTime.hour());
                final.minute(mTime.minute());
                final.second(mTime.second());
                return final.toDate();
            };

            const inTimeActual = parseTimeInternal(inTimeStr, parsedDate);
            if (!inTimeActual) continue;

            const shift = rec.employee?.shiftType || { startTime: settings.officeStartTime, graceMinutes: settings.graceMinutes };
            const shiftStartStr = shift.startTime || settings.officeStartTime || '10:00';
            const grace = shift.graceMinutes !== undefined ? shift.graceMinutes : (settings.graceMinutes || 10);

            const [sh, sm] = shiftStartStr.split(':');
            const shiftStart = moment.utc(parsedDate).hour(parseInt(sh)).minute(parseInt(sm)).second(0);
            
            const diff = moment(inTimeActual).diff(shiftStart, 'minutes');
            
            let isLate = false;
            let lateMinutes = 0;
            if (diff > grace) {
                isLate = true;
                lateMinutes = diff;
            }

            // Only update if changed or if it was false but should be true
            if (rec.isLate !== isLate || rec.lateMinutes !== lateMinutes) {
                await Attendance.findByIdAndUpdate(rec._id, { 
                    isLate, 
                    lateMinutes,
                    inTimeActual, // Also repair this field
                    status: (isLate && (!rec.status || rec.status === 'Present')) ? 'Late' : rec.status
                });
                updatedCount++;
            }
        }

        console.log(`Repair completed. Updated ${updatedCount} records.`);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

repair();
