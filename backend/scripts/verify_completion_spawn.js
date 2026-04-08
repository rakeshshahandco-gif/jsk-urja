import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TaskMaster } from '../src/models/taskMaster.model.js';
import { Task } from '../src/models/task.model.js';
import { TaskGroup } from '../src/models/taskGroup.model.js';
import { User } from '../src/models/user.model.js';
import { generateTaskFromMaster } from '../src/services/taskGenerator.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const verify = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB.');

        const user = await User.findOne({ isActive: true });
        const group = await TaskGroup.findOne();

        // 1. Create a Master
        const master = await TaskMaster.create({
            title: 'Completion Spawn Test ' + Date.now(),
            description: 'Testing if closing a task spawns the next one.',
            category: null,
            priority: 'MEDIUM',
            assignedTo: user._id,
            group: group._id,
            recurrence: {
                enabled: true,
                frequency: 'DAILY',
                interval: 1,
                startDate: new Date(),
                endType: 'NEVER'
            },
            createdBy: user._id
        });
        console.log('Test Master Created:', master.title);

        // 2. Spawn the FIRST instance
        const firstTask = await Task.create({
            title: master.title,
            groupId: master.group,
            taskMasterId: master._id,
            dueDate: master.recurrence.startDate,
            status: 'OPEN',
            createdBy: user._id
        });
        console.log('First Task Created:', firstTask._id, 'Due:', firstTask.dueDate);

        // 3. Simulate closure AND triggering generation
        console.log('Simulating task closure...');
        firstTask.status = 'COMPLETED';
        await firstTask.save();

        // Trigger generation
        await generateTaskFromMaster(master._id);

        // 4. Verify Second instance exists
        const secondTask = await Task.findOne({
            taskMasterId: master._id,
            _id: { $ne: firstTask._id }
        });

        if (secondTask) {
            console.log('SUCCESS: Second task spawned automatically!');
            console.log('First Task Due:', firstTask.dueDate);
            console.log('Second Task Due:', secondTask.dueDate);
        } else {
            throw new Error('FAIL: Second task was not spawned.');
        }

        // 5. Check master's update
        const updatedMaster = await TaskMaster.findById(master._id);
        console.log('Updated Master Next Run Date:', updatedMaster.nextRunDate);

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

verify();
