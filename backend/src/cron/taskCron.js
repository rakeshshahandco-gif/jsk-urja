import cron from 'node-cron';
import { TaskMaster } from '../models/taskMaster.model.js';
import { generateTaskFromMaster } from '../services/taskGenerator.service.js';

export const startTaskCron = () => {
    // Run at 00:30 everyday
    cron.schedule('30 0 * * *', async () => {
        console.log('⏰ Running daily task master cron job...');
        try {
            const now = new Date();
            const lookAheadDate = new Date();
            lookAheadDate.setDate(lookAheadDate.getDate() + 7);
            
            // Find all active recurring masters ready for generation (either past-due or due within 7 days)
            const activeMasters = await TaskMaster.find({
                isActive: true,
                $or: [
                    { nextRunDate: { $lte: lookAheadDate } },
                    { nextRunDate: { $exists: false } },
                    { nextRunDate: null }
                ]
            });

            console.log(`Found ${activeMasters.length} active masters ready for generation.`);

            for (const master of activeMasters) {
                await generateTaskFromMaster(master._id, now);
            }

        } catch (error) {
            console.error('❌ Error in task master cron:', error);
        }
    });

    console.log('✅ Task Master Cron Job scheduled (00:30 daily)');
};
