import mongoose from 'mongoose';
import { Task } from './src/models/task.model.js';
import { TaskGroup } from './src/models/taskGroup.model.js';
import { User } from './src/models/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const users = await User.find({});
        for (const user of users) {
            let generalGroup = await TaskGroup.findOne({ name: 'General', createdBy: user._id });
            if (!generalGroup) {
                generalGroup = await TaskGroup.create({
                    name: 'General',
                    notes: 'Auto-created group for unassigned tasks',
                    visibility: 'PRIVATE',
                    createdBy: user._id
                });
                console.log(`Created General group for user: ${user.username}`);
            }

            const result = await Task.updateMany(
                { createdBy: user._id, groupId: null },
                { $set: { groupId: generalGroup._id } }
            );
            if (result.modifiedCount > 0) {
                console.log(`Migrated ${result.modifiedCount} tasks for user: ${user.username}`);
            }
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
