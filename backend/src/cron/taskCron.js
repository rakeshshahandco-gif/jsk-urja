import cron from 'node-cron';
import { TaskMaster } from '../models/taskMaster.model.js';
import { Company } from '../models/company.model.js';
import { generateTaskFromMaster } from '../services/taskGenerator.service.js';
import { companyScopeAls } from '../utils/companyScopeContext.js';

export const startTaskCron = () => {
    // Run at 00:30 everyday
    cron.schedule('30 0 * * *', async () => {
        console.log('⏰ Running daily task master cron job...');
        try {
            const now = new Date();
            const lookAheadDate = new Date();
            lookAheadDate.setDate(lookAheadDate.getDate() + 7);

            const companies = await Company.find({ isActive: true }).select('_id companyName').lean();

            for (const co of companies) {
                await companyScopeAls.run({ companyId: co._id }, async () => {
                    const activeMasters = await TaskMaster.find({
                        isActive: true,
                        $or: [
                            { nextRunDate: { $lte: lookAheadDate } },
                            { nextRunDate: { $exists: false } },
                            { nextRunDate: null }
                        ]
                    });

                    console.log(`[${co.companyName}] Found ${activeMasters.length} active masters ready for generation.`);

                    for (const master of activeMasters) {
                        await generateTaskFromMaster(master._id, now);
                    }
                });
            }

        } catch (error) {
            console.error('❌ Error in task master cron:', error);
        }
    });

    console.log('✅ Task Master Cron Job scheduled (00:30 daily)');
};
