import mongoose from 'mongoose';
import { TaskGroup } from './src/models/taskGroup.model.js';
import { TaskGroupItem } from './src/models/taskGroupItem.model.js';
import { User } from './src/models/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk-urja');
        console.log('Connected to MongoDB');

        const admin = await User.findOne({ role: 'admin' });
        if (!admin) {
            console.error('Admin user not found. Please create an admin first.');
            process.exit(1);
        }

        // Check if template exists
        const existing = await TaskGroup.findOne({ name: 'Monthly Billing Payments', kind: 'TEMPLATE' });
        if (existing) {
            console.log('Template already exists. Skipping seed.');
            process.exit(0);
        }

        const template = await TaskGroup.create({
            name: 'Monthly Billing Payments',
            kind: 'TEMPLATE',
            recurrence: 'MONTHLY',
            recurrenceRule: { dayOfMonth: 5 },
            assignToAll: true,
            createdBy: admin._id,
        });

        const items = [
            { title: 'Mobile Bill No 1', dueOffsetDays: 0, sortOrder: 0 },
            { title: 'Mobile Bill No 2', dueOffsetDays: 0, sortOrder: 1 },
            { title: 'Electricity Bill', dueOffsetDays: 0, sortOrder: 2 },
            { title: 'LIC Payment', dueOffsetDays: 0, sortOrder: 3 },
        ];

        await TaskGroupItem.insertMany(items.map(item => ({
            ...item,
            groupTemplateId: template._id
        })));

        console.log('Seed successful: "Monthly Billing Payments" template created.');
        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
};

seed();
