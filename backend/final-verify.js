import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/user.model.js';

dotenv.config();

const finalVerification = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        // 1. Check if multiple null emails are allowed
        const ts = Date.now();
        try {
            await User.create({ name: 'N1', username: 'u1_' + ts, password: 'password123', email: undefined });
            await User.create({ name: 'N2', username: 'u2_' + ts, password: 'password123', email: undefined });
            console.log('1. PASS: Allowed multiple null emails');
        } catch (e) {
            console.error('1. FAIL: Could not create multiple null emails:', e.message);
        }

        // 2. Check if duplicate NOT-null emails are blocked
        try {
            const email = `test_${ts}@example.com`;
            await User.create({ name: 'N3', username: 'u3_' + ts, password: 'password123', email });
            await User.create({ name: 'N4', username: 'u4_' + ts, password: 'password123', email });
            console.log('2. FAIL: Allowed duplicate non-null emails');
        } catch (e) {
            console.log('2. PASS: Correctly blocked duplicate non-null email:', e.message);
        }

        // 3. Check if empty strings are handled (should be treated as null)
        try {
            await User.create({ name: 'N5', username: 'u5_' + ts, password: 'password123', email: '' });
            console.log('3. PASS: Allowed empty string email (if controller/model handles it)');
        } catch (e) {
            console.error('3. FAIL: Blocked empty string email:', e.message);
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

finalVerification();
