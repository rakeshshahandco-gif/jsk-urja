import cron from 'node-cron';
import { Task } from '../models/task.model.js';
import { calculateNextDueDate } from '../utils/recurrence.js';

export const startTaskCron = () => {
    // Run at 00:05 everyday
    cron.schedule('5 0 * * *', async () => {
        console.log('⏰ Running daily task cron job...');
        try {
            // Find latest task for each recurring series
            const latestTasks = await Task.aggregate([
                {
                    $match: {
                        isRecurring: true,
                        seriesId: { $ne: null }
                    }
                },
                { $sort: { dueDate: -1 } },
                {
                    $group: {
                        _id: "$seriesId",
                        latestTask: { $first: "$$ROOT" }
                    }
                }
            ]);

            // console.log(`Found ${latestTasks.length} recurring series.`);

            const results = await Promise.allSettled(latestTasks.map(async ({ latestTask }) => {
                // If latest task is completed, we might need a new one
                if (latestTask.status === 'COMPLETED') {
                    const nextDueDate = calculateNextDueDate(latestTask);

                    if (nextDueDate) {
                        // Check if next occurrence already exists
                        const exists = await Task.findOne({
                            seriesId: latestTask.seriesId,
                            dueDate: nextDueDate
                        });

                        if (!exists) {
                            console.log(`Creating missing recurrence for series ${latestTask.seriesId}`);

                            const nextTaskData = {
                                title: latestTask.title,
                                description: latestTask.description,
                                priority: latestTask.priority,
                                status: 'OPEN',
                                group: latestTask.group,
                                assignedTo: latestTask.assignedTo,
                                createdBy: latestTask.createdBy,
                                dueDate: nextDueDate,
                                isRecurring: true,
                                recurrence: latestTask.recurrence,
                                seriesId: latestTask.seriesId,
                                parentTask: latestTask._id
                            };

                            await Task.create(nextTaskData);
                            return { created: true, seriesId: latestTask.seriesId };
                        }
                    }
                }
                return { created: false };
            }));

            const createdCount = results.filter(r => r.status === 'fulfilled' && r.value.created).length;
            if (createdCount > 0) {
                console.log(`✅ Created ${createdCount} missing recurring tasks.`);
            }

        } catch (error) {
            console.error('❌ Error in daily task cron:', error);
        }
    });

    console.log('✅ Task Cron Job scheduled (00:05 daily)');
};
