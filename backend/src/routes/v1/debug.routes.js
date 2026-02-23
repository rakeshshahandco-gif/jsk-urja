import express from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import Conversation from '../../models/conversation.model.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Public health route
router.get('/health', (req, res) => {
    res.send({ ok: true, message: 'Backend is healthy', timestamp: new Date() });
});

// Admin-only repair/repair endpoint
router.post('/repair-dates', protect, authorize('admin'), async (req, res) => {
    try {
        logger.info('🛠️ Starting Conversation Date Repair...');

        // Find conversations where conversationDate is missing or null
        const invalidConvs = await Conversation.find({
            $or: [
                { conversationDate: { $exists: false } },
                { conversationDate: null }
            ]
        });

        logger.info(`🔍 Found ${invalidConvs.length} records needing repair.`);

        let count = 0;
        for (const conv of invalidConvs) {
            // Use createdAt or current date as fallback
            conv.conversationDate = conv.createdAt || new Date();
            await conv.save();
            count++;
        }

        logger.info(`✅ Successfully repaired ${count} records.`);

        res.status(200).send(new ApiResponse(200, { repairedCount: count }, 'Repair completed successfully'));
    } catch (error) {
        logger.error('❌ Repair failed:', error);
        res.status(500).send(new ApiResponse(500, null, 'Repair failed: ' + error.message));
    }
});

export default router;
