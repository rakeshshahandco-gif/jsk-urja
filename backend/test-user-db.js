import mongoose from 'mongoose';
import { User } from './src/models/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        // Check indexes
        const indexes = await User.collection.getIndexes();
        console.log('User Indexes:', JSON.stringify(indexes, null, 2));

        // Test creation with empty email
        try {
            const user1 = await User.create({
                name: 'Test 1',
                username: 'test1_' + Date.now(),
                password: 'password123',
                email: undefined
            });
            console.log('Created user1 (null email)');

            const user2 = await User.create({
                name: 'Test 2',
                username: 'test2_' + Date.now(),
                password: 'password123',
                email: undefined
            });
            console.log('Created user2 (null email)');
        } catch (e) {
            console.error('Failed to create users with null email:', e.message);
        }

        // Test creation with short password
        try {
            await User.create({
                name: 'Test Short',
                username: 'short_' + Date.now(),
                password: '12345'
            });
            console.log('Created user with short password (this shouldn\'t happen!)');
        } catch (e) {
            console.log('Caught expected error for short password:', e.message);
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

test();
