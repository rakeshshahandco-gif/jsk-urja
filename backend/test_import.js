import { connect } from 'mongoose';
import { importAttendance } from './src/controllers/hr.controller.js';
import { Employee } from './src/models/employee.model.js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    try {
        await connect(process.env.MONGODB_URL);
        console.log('DB Connected');
        
        // Mock req and res
        const buffer = fs.readFileSync('./public/attendance_template.csv');
        const req = {
            file: {
                originalname: 'attendance_template.csv',
                buffer: buffer
            },
            user: { _id: '60d0fe4f5311236168a109ca' } // dummy user ID
        };
        
        const res = {
            send: (response) => console.log('Response:', JSON.stringify(response, null, 2)),
            status: (code) => { console.log('Status:', code); return res; }
        };
        
        await importAttendance(req, res, (err) => console.log('Error caught:', err));
        
        // Check if employees were created
        const rakeh = await Employee.findOne({ employeeName: 'Rakesh Shah' });
        console.log('Rakesh found?:', rakeh ? rakeh.employeeCode : 'No');
        
        process.exit();
    } catch (e) {
        console.error('Fatal:', e);
        process.exit(1);
    }
})();
