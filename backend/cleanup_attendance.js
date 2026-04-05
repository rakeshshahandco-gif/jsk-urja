import { connect } from 'mongoose';
import { Attendance } from './src/models/attendance.model.js';
import { Employee } from './src/models/employee.model.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    try {
        await connect(process.env.MONGODB_URL);
        console.log('Connected to DB');
        
        // 1. Delete all attendances
        const attRes = await Attendance.deleteMany({});
        console.log(`Deleted ${attRes.deletedCount} attendance records.`);
        
        // 2. Delete auto-created employees
        const empRes = await Employee.deleteMany({ remarks: 'Auto-created from Attendance Import' });
        console.log(`Deleted ${empRes.deletedCount} auto-created employee records.`);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
