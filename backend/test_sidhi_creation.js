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
        
        // Mock data for "Sidhi" who we know was failing
        const csvContent = "EmployeeName,Date,ClockIn,ClockOut,Status\nSidhi,2026-04-01,09:00:00,18:00:00,Present";
        fs.writeFileSync('temp_test.csv', csvContent);
        
        const buffer = fs.readFileSync('temp_test.csv');
        const req = {
            file: {
                originalname: 'temp_test.csv',
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
        
        console.log('\nTesting import for "Sidhi"...');
        
        await new Promise((resolve) => {
            const originalSend = res.send;
            res.send = (response) => {
                originalSend(response);
                resolve();
            }
            importAttendance(req, res, (err) => {
                console.log('Error:', err);
                resolve();
            });
        });
        
        // VERIFY DB
        console.log('\n--- DB VERIFICATION ---');
        const emp = await Employee.findOne({ employeeName: /Sidhi/i });
        if (emp) {
            console.log(`? SUCCESS: Sidhi auto-created with code: ${emp.employeeCode}`);
        } else {
            console.log(`? FAILURE: Sidhi not found in database.`);
        }
        
        fs.unlinkSync('temp_test.csv');
        process.exit();
    } catch (e) {
        console.error('Fatal Script Error:', e);
        process.exit(1);
    }
})();
