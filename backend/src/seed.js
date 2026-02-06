import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/user.model.js';

dotenv.config();

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/crm-db');
        console.log('Connected to DB');

        const adminExists = await User.findOne({ role: 'admin' });
        if (adminExists) {
            console.log('Admin already exists');
        } else {
            await User.create({
                name: 'System Admin',
                username: 'admin',
                email: 'admin@crm.com',
                password: 'admin123',
                role: 'admin',
                permissions: ['*'],
                isActive: true
            });
            console.log('Admin user created');
        }

        process.exit();
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();
