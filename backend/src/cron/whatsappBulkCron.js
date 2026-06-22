import cron from 'node-cron';
import { processQueue } from '../services/whatsappBulkQueue.service.js';
import logger from '../utils/logger.js';

export const startWhatsappBulkCron = () => {
    cron.schedule('* * * * *', async () => {
        try {
            await processQueue();
        } catch (error) {
            logger.error('WhatsApp Bulk cron error:', error);
        }
    });
};
