import mongoose from 'mongoose';
import { Group } from '../src/models/group.model.js';
import { Task } from '../src/models/task.model.js';
import { GroupMember } from '../src/models/groupMember.model.js';
import { User } from '../src/models/user.model.js';
import { calculateNextDueDate } from '../src/utils/recurrence.js';

// Connection String from .env
const MONGODB_URL = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

const runTest = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('✅ Connected');

        // 1. Setup Test User
        console.log('👤 Creating Test Admin User...');
        const uniqueId = Date.now();
        const adminUser = await User.create({
            name: `Test Admin ${uniqueId}`,
            email: `admin${uniqueId}@example.com`,
            password: 'password123',
            role: 'admin',
            isActive: true,
            username: `admin${uniqueId}`
        });
        console.log(`✅ User created: ${adminUser._id}`);

        // 2. Create Group
        console.log('🏢 Creating Test Group...');
        const group = await Group.create({
            name: `Test Group ${uniqueId}`,
            code: `TG${uniqueId}`,
            description: 'Automated Test Group',
            createdBy: adminUser._id
        });
        console.log(`✅ Group created: ${group._id}`);

        // 3. Add Member (Self)
        console.log('➕ Adding Admin to Group as OWNER...');
        await GroupMember.create({
            group: group._id,
            user: adminUser._id,
            role: 'OWNER',
            addedBy: adminUser._id
        });
        console.log('✅ Member added');

        // 4. Create Recurring Task
        console.log('📝 Creating Recurring Task (Weekly)...');
        const dueDate = new Date(); // Today
        const task = await Task.create({
            title: 'Weekly Report',
            description: 'Should recur next week',
            priority: 'HIGH',
            status: 'OPEN',
            group: group._id,
            assignedTo: adminUser._id,
            createdBy: adminUser._id,
            dueDate: dueDate,
            isRecurring: true,
            recurrence: {
                type: 'WEEKLY',
                interval: 1,
                dayOfWeek: dueDate.getDay()
            },
            seriesId: `series_${uniqueId}`
        });
        console.log(`✅ Task created: ${task._id} (Due: ${task.dueDate.toISOString()})`);

        // 5. Simulate Task Completion (Trigger Recurrence)
        console.log('✅ Completing Task...');

        // Emulate Controller Logic for Completion
        task.status = 'COMPLETED';
        task.completedAt = new Date();
        await task.save();

        // Recurrence Logic (From Controller)
        const nextDueDate = calculateNextDueDate(task);
        if (nextDueDate) {
            console.log(`🔄 Calculated Next Due Date: ${nextDueDate.toISOString()}`);

            const nextTaskData = {
                title: task.title,
                description: task.description,
                priority: task.priority,
                status: 'OPEN',
                group: task.group,
                assignedTo: task.assignedTo,
                createdBy: task.createdBy,
                dueDate: nextDueDate,
                isRecurring: true,
                recurrence: task.recurrence,
                seriesId: task.seriesId,
                parentTask: task._id
            };

            const nextTask = await Task.create(nextTaskData);
            console.log(`✅ Next Task Created: ${nextTask._id} (Due: ${nextTask.dueDate.toISOString()})`);

            // Verification
            if (nextTask.dueDate.getTime() > task.dueDate.getTime()) {
                console.log('✅ SUCCESS: Next task is scheduled in the future.');
            } else {
                console.error('❌ FAILURE: Next task date is incorrect.');
            }

        } else {
            console.error('❌ FAILURE: Next due date not calculated.');
        }

        // Cleanup
        console.log('🧹 Cleaning up...');
        await Task.deleteMany({ seriesId: `series_${uniqueId}` });
        await GroupMember.deleteMany({ group: group._id });
        await Group.findByIdAndDelete(group._id);
        await User.findByIdAndDelete(adminUser._id);
        console.log('✅ Cleanup complete');

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected');
    }
};

runTest();
