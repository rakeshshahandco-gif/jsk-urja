
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';

const mongoUrl = process.env.MONGODB_URL;

async function run() {
  try {
    await mongoose.connect(mongoUrl);
    console.log('Connected');
    const db = mongoose.connection.db;
    
    // Find Swarup
    const swarup = await db.collection('employees').findOne({ employeeName: /Swarup/i });
    if (!swarup) {
      console.log('Swarup not found');
      process.exit();
    }
    console.log('Found Swarup:', swarup.employeeName, swarup._id.toString());
    console.log('DOJ:', swarup.dateOfJoining);

    const month = 3;
    const year = 2026;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month - 1, 31, 23, 59, 59);

    console.log('Range:', startDate.toISOString(), 'to', endDate.toISOString());

    const attendances = await db.collection('attendances').find({
      date: { $gte: startDate, $lte: endDate }
    }).toArray();

    console.log('Total matches in DB for range:', attendances.length);

    const swarupAtt = attendances.filter(a => a.employee.toString() === swarup._id.toString());
    console.log('Swarup matches:', swarupAtt.length);
    
    if (swarupAtt.length > 0) {
      console.log('Sample dates:', swarupAtt.slice(0, 3).map(a => a.date.toISOString()));
      console.log('Sample statuses:', swarupAtt.slice(0, 3).map(a => a.status));
    }

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
