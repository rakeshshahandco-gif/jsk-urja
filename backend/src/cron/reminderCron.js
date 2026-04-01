import cron from 'node-cron';
import Reminder from '../models/reminder.model.js';
import { getIO } from '../config/socket.js';
import logger from '../utils/logger.js';
import moment from 'moment';

/**
 * Start the Reminder Cron Job
 * Runs every minute to check for due reminders and push real-time alerts.
 */
export const startReminderCron = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = moment();
            const currentDate = now.startOf('day').toDate();
            const currentTime = now.format('HH:mm');

            // Find open reminders for today that match current time or were missed in the last 5 minutes
            // and haven't been notified yet.
            // Note: We use a small window to ensure reliability if the server was briefly down.
            
            const dueReminders = await Reminder.find({
                isClosed: false,
                isNotified: { $ne: true },
                reminderDate: currentDate,
                reminderTime: { $lte: currentTime }
            }).populate('customerId', 'customerName company');

            if (dueReminders.length === 0) return;

            const io = getIO();
            logger.info(`⏰ Cron: Processing ${dueReminders.length} due reminders`);

            for (const reminder of dueReminders) {
                if (!reminder.createdBy) continue;

                const payload = {
                    _id: `reminder-${reminder._id}`,
                    type: 'REMINDER',
                    title: `Reminder: ${reminder.followUpType}`,
                    message: `${reminder.customerId?.customerName || 'Customer'}: ${reminder.taskNote || 'No notes'}`,
                    priority: reminder.priority,
                    createdAt: new Date(),
                    link: `/reports/open-reminders`, // Link to reminder dashboard
                    actor: { name: 'System' }
                };

                // Emit to the creator of the reminder
                io.to(`user_${reminder.createdBy.toString()}`).emit('notification:new', payload);
                
                // Mark as notified so we don't send it again
                reminder.isNotified = true;
                await reminder.save();
            }

        } catch (error) {
            logger.error('❌ Error in reminder cron:', error);
        }
    });

    logger.info('✅ Real-time Reminder Cron Job scheduled (Every minute)');
};
