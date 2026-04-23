import { Task } from '../models/task.model.js';
import { TaskMaster } from '../models/taskMaster.model.js';
import { calculateNextDueDate } from '../utils/recurrence.js';
import { emitTaskUpdate } from './socketEvent.service.js';
/**
 * Generates the next task instance for a given TaskMaster.
 * This is designed to be idempotent and safe to call multiple times.
 * @param {string} masterId - The ID of the TaskMaster template.
 * @param {Date} [forceNow] - Optional date to treat as "now" (useful for testing or catch-up).
 * @returns {Promise<Object|null>} - The created task instance or null if no task was created.
 */
export const generateTaskFromMaster = async (masterId, forceNow = new Date()) => {
    try {
        const master = await TaskMaster.findById(masterId);
        if (!master || !master.isActive) return null;

        const now = forceNow;
        
        // 1. Determine the due date for the task we are about to create
        // If nextRunDate is in the future, we don't generate yet (unless manually triggered)
        // If nextRunDate is missing, we use recurrence.startDate
        let dueDate = master.nextRunDate || master.recurrence.startDate || now;

        // 2. Check if an OPEN task for this master and this due date already exists
        // This prevents double generation if both completion and cron trigger.
        // We check for tasks with the same master and due date that are not CANCELLED.
        const dueStart = new Date(dueDate);
        dueStart.setHours(0, 0, 0, 0);
        const dueEnd = new Date(dueDate);
        dueEnd.setHours(23, 59, 59, 999);
        const existingTask = await Task.findOne({
          taskMasterId: master._id,
          dueDate: { $gte: dueStart, $lte: dueEnd },
          status: { $ne: 'CANCELLED' }
        });

        if (existingTask && existingTask.status === 'OPEN') {
            console.log(`Skipping generation for master ${master.title}: Open task already exists for ${dueDate.toLocaleDateString()}`);
            return null;
        }

        // 3. Create the task instance
        const taskInstance = await Task.create({
            title: master.title,
            description: master.description,
            taskCategoryId: master.category,
            priority: master.priority,
            assigneeIds: master.assignedTo ? [master.assignedTo] : [master.createdBy],
            assignmentMode: master.assignedTo ? 'SINGLE' : 'SELF',
            groupId: master.group,
            dueDate: dueDate,
            status: 'OPEN',
            taskMasterId: master._id,
            amount: master.defaultAmount || 0,
            createdBy: master.createdBy || 'SYSTEM'
        });

        // 4. Calculate the NEXT run date for the template
        // If interval is 0 or negative, treat as a one‑off task and deactivate the master
        if (master.recurrence.interval <= 0) {
            console.log(`⚠️ Interval is ${master.recurrence.interval}; disabling further recurrence for master ${master.title}`);
            master.isActive = false;
            await master.save();
            // No next run date – we still return the created task instance
            var nextDate = null;
        } else {
            var nextDate = calculateNextDueDate({
                isRecurring: true,
                recurrence: master.recurrence,
                dueDate: dueDate
            });
        }

        // 5. Update the master
        master.lastGeneratedAt = now;
        master.nextRunDate = nextDate;

        // 6. Handle end-of-series rules
        if (nextDate) {
            if (master.recurrence.endType === 'ON_DATE' && nextDate > master.recurrence.endDate) {
                master.isActive = false;
            }
            if (master.recurrence.endType === 'AFTER_COUNT') {
                const instanceCount = await Task.countDocuments({ taskMasterId: master._id });
                if (instanceCount >= master.recurrence.occurrenceCount) {
                    master.isActive = false;
                }
            }
        } else {
            // No more occurrences calculated
            master.isActive = false;
        }

        await master.save();
        console.log(`✅ Generated task instance for master: ${master.title} (Due: ${dueDate.toLocaleDateString()})`);
        
        // Broadcast the new task to the UI
        try {
            const { emitTaskUpdate } = await import('./socketEvent.service.js');
            await emitTaskUpdate(taskInstance._id, 'create');
        } catch (err) {
            console.error('Failed to emit socket update for generated task:', err);
        }

        return taskInstance;

    } catch (error) {
        console.error(`❌ Failed to generate task for master ${masterId}:`, error);
        return null;
    }
};
