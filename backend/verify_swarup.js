
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';

const mongoUrl = process.env.MONGODB_URL;

async function run() {
  try {
    await mongoose.connect(mongoUrl);
    const db = mongoose.connection.db;
    
    const swarup = await db.collection('employees').findOne({ employeeName: /Swarup/i });
    console.log('Swarup DOJ:', swarup.dateOfJoining);
    
    const month = 3;
    const year = 2026;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month - 1, 31, 23, 59, 59);

    const attendances = await db.collection('attendances').find({
      date: { $gte: startDate, $lte: endDate }
    }).toArray();

    const holidays = await db.collection('holidays').find({
      date: { $gte: startDate, $lte: endDate },
      isActive: true
    }).toArray();

    // LOGIC FROM CONTROLLER
    const empAttendances = attendances.filter(att => att.employee.toString() === swarup._id.toString());
    const firstRecordDate = empAttendances.length > 0 ? new Date(Math.min(...empAttendances.map(a => new Date(a.date)))) : null;
    
    const effectiveTenureStart = (firstRecordDate && firstRecordDate < swarup.dateOfJoining) ? firstRecordDate : swarup.dateOfJoining;
    const tenureStart = (effectiveTenureStart && effectiveTenureStart > startDate) ? new Date(effectiveTenureStart) : startDate;
    const tenureEnd = endDate; // simplify for Swarup (he hasn't left)
    
    tenureStart.setHours(0,0,0,0);
    tenureEnd.setHours(23,59,59,999);

    const recordedAttendance = empAttendances.filter(att => {
        const d = new Date(att.date);
        return d >= tenureStart && d <= tenureEnd;
    });

    console.log('Effective Tenure Start:', tenureStart.toISOString());
    console.log('Recorded Attendance in tenure:', recordedAttendance.length);

    let attendanceDays = 0;
    let absentDays = 0;
    let hasPositiveRecords = false;

    recordedAttendance.forEach(att => {
        const day = new Date(att.date);
        const isSunday = day.getDay() === 0;
        const isHoliday = holidays.some(h => new Date(h.date).toDateString() === day.toDateString());
        
        const status = (att.status || '').toLowerCase().trim();

        if (['present', 'half day', 'late'].includes(status)) {
            hasPositiveRecords = true;
        }

        if (!isSunday && !isHoliday) {
            if (['present', 'late'].includes(status)) attendanceDays += 1;
            else if (status === 'half day') attendanceDays += 0.5;
            else if (['absent', 'unpaid leave'].includes(status)) absentDays += 1;
        } else {
            if (['absent', 'unpaid leave'].includes(status)) absentDays += 1;
        }
    });

    // SIMULATED getSundaysInRange
    let sundays = 0;
    let curr = new Date(tenureStart);
    while(curr <= tenureEnd) {
        if(curr.getDay() === 0) sundays++;
        curr.setDate(curr.getDate() + 1);
    }
    
    const activeHolidays = holidays.filter(h => new Date(h.date) >= tenureStart && new Date(h.date) <= tenureEnd).length;

    let daysWorked = 0;
    if (hasPositiveRecords) {
        daysWorked = attendanceDays + sundays + activeHolidays;
    }
    
    console.log('Result for Swarup:');
    console.log('attendanceDays:', attendanceDays);
    console.log('sundays:', sundays);
    console.log('activeHolidays:', activeHolidays);
    console.log('daysWorked Final:', daysWorked);

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
