import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/user.model.js';

dotenv.config();

const testMassCreate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const ts = Date.now();
        for (let i = 1; i <= 3; i++) {
            try {
                const u = await User.create({
                    name: `Test User ${i}`,
                    username: `testuser_${ts}_${i}`,
                    password: 'password123',
                    email: undefined
                });
                console.log(`Successfully created user ${i}: ${u.username}`);
            } catch (e) {
                console.error(`Failed to create user ${i}:`, e.message);
                if (e.code === 11000) {
                    console.log('Duplicate Key Error Pattern:', JSON.stringify(e.keyPattern, null, 2));
                }
            }
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

testMassCreate();
