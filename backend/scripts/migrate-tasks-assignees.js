import mongoose from 'mongoose';
import { Task } from '../src/models/task.model.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const migrate = async () => {
    try {
        console.log('🔄 Starting migration for multi-assignee tasks...');
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/jsk-urja');
        console.log('✅ Connected to MongoDB');

        const tasks = await Task.find({
            $or: [
                { assigneeIds: { $exists: false } },
                { assigneeIds: { $size: 0 } },
                { assignToAll: { $exists: false } }
            ]
        });

        console.log(`📊 Found ${tasks.length} tasks to migrate.`);

        let count = 0;
        for (const task of tasks) {
            if (!task.assigneeIds || task.assigneeIds.length === 0) {
                if (task.assignedTo) {
                    task.assigneeIds = [task.assignedTo];
                }
            }

            if (task.assignToAll === undefined) {
                task.assignToAll = false;
            }

            await task.save();
            count++;
            if (count % 10 === 0) console.log(`Processed ${count}/${tasks.length} tasks...`);
        }

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrate();
