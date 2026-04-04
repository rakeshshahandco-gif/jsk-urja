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
        
        const buffer = fs.readFileSync('../public/attendance_template.csv');
        const req = {
            file: {
                originalname: 'attendance_template.csv',
                buffer: buffer
            },
            user: { _id: '60d0fe4f5311236168a109ca' }
        };
        
        const res = {
            send: (response) => {
                console.log('\n--- API RESPONSE ---');
                console.log(JSON.stringify(response, null, 2));
            },
            status: (code) => { console.log('HTTP Status:', code); return res; }
        };
        
        console.log('\nStarting import process...');
        
        // Wrap middleware execution in promise
        await new Promise((resolve) => {
            const originalSend = res.send;
            res.send = (response) => {
                originalSend(response);
                resolve();
            }
            importAttendance(req, res, (err) => {
                console.log('Error caught by next():', err);
                resolve();
            });
        });
        
        // VERIFY DB
        console.log('\n--- DB VERIFICATION ---');
        const employees = await Employee.find({ employeeName: { $in: ['Rakesh Shah', 'John Doe'] } });
        console.log(`Found ${employees.length} employees`);
        employees.forEach(emp => {
            console.log(`Found auto-created employee: ${emp.employeeName} -> Code: ${emp.employeeCode}`);
        });
        
        process.exit();
    } catch (e) {
        console.error('Fatal Script Error:', e);
        process.exit(1);
    }
})();
