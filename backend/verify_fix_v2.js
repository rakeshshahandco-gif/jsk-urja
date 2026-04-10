
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';

const mongoUrl = process.env.MONGODB_URL;

async function run() {
  try {
    await mongoose.connect(mongoUrl);
    const db = mongoose.connection.db;
    
    const swarup = await db.collection('employees').findOne({ employeeName: /Swarup/i });
    
    const month = 3, year = 2026; // March 2026
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month - 1, 31, 23, 59, 59);

    const attendances = await db.collection('attendances').find({
      employee: swarup._id,
      date: { $gte: startDate, $lte: endDate }
    }).toArray();

    const holidays = await db.collection('holidays').find({
      date: { $gte: startDate, $lte: endDate },
      }).toArray();

    // NEW LOGIC TEST
    const sundaysTotal = 5; // Mar 1, 8, 15, 22, 29
    const holidaysTotal = holidays.length;

    let attendanceDays = 0;
    let unpaidSundays = 0;
    let unpaidHolidays = 0;
    let hasPositiveRecords = false;

    attendances.forEach(att => {
        const d = new Date(att.date);
        const isSun = d.getDay() === 0;
        const isHol = holidays.some(h => new Date(h.date).toDateString() === d.toDateString());
        const status = (att.status || '').toLowerCase().trim();

        if (['present', 'half day', 'late'].includes(status)) {
            hasPositiveRecords = true;
        }

        if (!isSun && !isHol) {
            if (['present', 'late'].includes(status)) attendanceDays += 1;
            else if (status === 'half day') attendanceDays += 0.5;
        } else {
            if (['absent', 'unpaid leave'].includes(status)) {
                if (isSun) unpaidSundays += 1;
                else unpaidHolidays += 1;
            }
        }
    });

    const paidSundays = Math.max(0, sundaysTotal - unpaidSundays);
    const paidHolidays = Math.max(0, holidaysTotal - unpaidHolidays);
    const daysWorkedFinal = attendanceDays + paidSundays + paidHolidays;

    console.log('--- VERIFICATION RESULT ---');
    console.log('attendanceDays (Working):', attendanceDays);
    console.log('unpaidSundays:', unpaidSundays);
    console.log('unpaidHolidays:', unpaidHolidays);
    console.log('paidSundays:', paidSundays);
    console.log('paidHolidays:', paidHolidays);
    console.log('daysWorkedFinal:', daysWorkedFinal);
    
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
