import cron from 'node-cron';
import { Task } from '../models/task.model.js';
import { TaskMaster } from '../models/taskMaster.model.js';
import { calculateNextDueDate } from '../utils/recurrence.js';

export const startTaskCron = () => {
    // Run at 00:30 everyday
    cron.schedule('30 0 * * *', async () => {
        console.log('⏰ Running daily task master cron job...');
        try {
            const now = new Date();
            
            // Find all active recurring masters
            const activeMasters = await TaskMaster.find({
                isActive: true,
                $or: [
                    { nextRunDate: { $lte: now } },
                    { nextRunDate: { $exists: false } },
                    { nextRunDate: null }
                ]
            });

            console.log(`Found ${activeMasters.length} active masters ready for generation.`);

            for (const master of activeMasters) {
                try {
                    // 1. Calculate the due date for the new task
                    // If nextRunDate is missing, use startDate
                    let dueDate = master.nextRunDate || master.recurrence.startDate || now;
                    
                    // 2. Create the task instance
                    const taskInstance = await Task.create({
                        title: master.title,
                        description: master.description,
                        category: master.category,
                        priority: master.priority,
                        assignedTo: master.assignedTo,
                        group: master.group,
                        dueDate: dueDate,
                        status: 'OPEN',
                        taskMasterId: master._id,
                        amount: master.defaultAmount || 0,
                        createdBy: master.createdBy || 'SYSTEM'
                    });

                    // 3. Calculate the NEXT run date
                    const nextDate = calculateNextDueDate({
                        isRecurring: true,
                        recurrence: master.recurrence,
                        dueDate: dueDate
                    });

                    // 4. Update the master
                    master.lastGeneratedAt = now;
                    master.nextRunDate = nextDate;

                    // 5. Check end rules
                    if (master.recurrence.endType === 'ON_DATE' && nextDate > master.recurrence.endDate) {
                        master.isActive = false;
                    }
                    if (master.recurrence.endType === 'AFTER_COUNT') {
                        // Count instances
                        const instanceCount = await Task.countDocuments({ taskMasterId: master._id });
                        if (instanceCount >= master.recurrence.occurrenceCount) {
                            master.isActive = false;
                        }
                    }

                    await master.save();
                    console.log(`✅ Generated task instance for master: ${master.title}`);

                } catch (innerError) {
                    console.error(`❌ Failed to process master ${master._id}:`, innerError);
                }
            }

        } catch (error) {
            console.error('❌ Error in task master cron:', error);
        }
    });

    console.log('✅ Task Master Cron Job scheduled (00:30 daily)');
};
