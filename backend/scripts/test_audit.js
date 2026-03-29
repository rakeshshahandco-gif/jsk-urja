import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { SalesOrder } from '../src/models/salesOrder.model.js';
import { User } from '../src/models/user.model.js';
import { AuditLog } from '../src/models/auditLog.model.js';
import { updateSO, deleteSO, restoreSO } from '../src/controllers/salesOrder.controller.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected.');
    try {
        const user = await User.findOne({ email: 'admin@rakeshshah.com' }) || await User.findOne();
        if (!user) throw new Error("No user");

        const so = await SalesOrder.findOne({ isDeleted: { $ne: true } });
        if (!so) throw new Error("No sales orders");

        console.log(`Testing with SO ${so.soNumber} and User ${user.email}`);

        const callApi = (fn, req) => new Promise((resolve, reject) => {
            const res = {
                status: () => res,
                json: (data) => resolve(data)
            };
            fn(req, res, (err) => err ? reject(err) : resolve());
        });

        // 1. UPDATE
        console.log('\n--- 1. UPDATE ---');
        const reqUpdate = {
            params: { id: so._id },
            body: { remarks: 'Partial Update Audit Test ' + Date.now() },
            user: { id: user._id },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'audit-test-script' }
        };
        const resUpdate = await callApi(updateSO, reqUpdate);
        console.log('Update success:', resUpdate?.success);

        // 2. CHECK AUDIT LOG FOR UPDATE
        const logs = await AuditLog.find({ resourceId: so._id }).sort({ createdAt: -1 }).limit(1);
        console.log('Latest Audit Log:', JSON.stringify(logs[0]?.details, null, 2));

        // 3. DELETE (Soft delete)
        console.log('\n--- 2. SOFT DELETE ---');
        const reqDelete = {
            params: { id: so._id },
            body: { reason: 'Test soft delete' },
            user: { id: user._id },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'audit-test-script' }
        };
        const resDelete = await callApi(deleteSO, reqDelete);
        console.log('Delete success:', resDelete?.success);
        const deletedSo = await SalesOrder.findById(so._id);
        console.log('isDeleted?', deletedSo.isDeleted);

        // 4. RESTORE 
        console.log('\n--- 3. RESTORE ---');
        const reqRestore = {
            params: { id: so._id },
            body: { reason: 'Test restore' },
            user: { id: user._id },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'audit-test-script' }
        };
        const resRestore = await callApi(restoreSO, reqRestore);
        console.log('Restore success:', resRestore?.success);
        const restoredSo = await SalesOrder.findById(so._id);
        console.log('isDeleted?', restoredSo.isDeleted);


    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
run();
