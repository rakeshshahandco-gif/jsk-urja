import cron from 'node-cron';
import { processQueue } from '../services/emailBulkQueue.service.js';
import logger from '../utils/logger.js';

export const startEmailBulkCron = () => {
    cron.schedule('* * * * *', async () => {
        try {
            await processQueue();
        } catch (error) {
            logger.error('Email Bulk cron error:', error);
        }
    });
};
