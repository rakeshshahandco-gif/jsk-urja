import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model.js';
import { initializeAccountingMasters } from '../src/utils/accountInitializer.js';

dotenv.config();

const runSeed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/crm-db');
        console.log('Connected to DB');

        const admin = await User.findOne({ username: 'admin' });
        if (!admin) {
            console.error('Admin user not found. Please run seed.js first.');
            process.exit(1);
        }

        await initializeAccountingMasters(admin._id);
        console.log('Seeding successful');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding:', error);
        process.exit(1);
    }
};

runSeed();
