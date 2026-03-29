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

// Admin-only repair endpoint for conversation dates
router.post('/repair-dates', protect, authorize('admin'), async (req, res) => {
    try {
        logger.info('🛠️ Starting Conversation Date Repair...');

        const invalidConvs = await Conversation.find({
            $or: [
                { conversationDate: { $exists: false } },
                { conversationDate: null }
            ]
        });

        logger.info(`🔍 Found ${invalidConvs.length} records needing repair.`);

        let count = 0;
        for (const conv of invalidConvs) {
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

/**
 * POST /api/v1/debug/repair-pi-ledger/:id
 * Reverses existing ledger entries for a Purchase Invoice and re-posts them correctly.
 * Use this to fix invoices saved before the ledger posting bug was fixed.
 */
router.post('/repair-pi-ledger/:id', protect, authorize('superadmin', 'admin'), async (req, res) => {
    const mongoose = (await import('mongoose')).default;
    const { PurchaseInvoice } = await import('../../models/purchaseInvoice.model.js');
    const { reverseInvoiceLedgerImpact, postPurchaseInvoiceToLedger } = await import('../../utils/ledgerDispatcher.js');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(req.params.id).session(session);
        if (!inv) {
            await session.abortTransaction();
            return res.status(404).send(new ApiResponse(404, null, 'Purchase Invoice not found'));
        }
        if (inv.isDeleted || inv.status === 'Cancelled') {
            await session.abortTransaction();
            return res.status(400).send(new ApiResponse(400, null, 'Cannot re-post a cancelled/deleted invoice'));
        }

        // Step 1: Reverse any existing ledger entries for this invoice number
        await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
        logger.info(`[repair-pi-ledger] Reversed existing ledger for ${inv.invoiceNumber}`);

        // Step 2: Re-post with the corrected ledger logic
        const vId = await postPurchaseInvoiceToLedger(inv, req.user._id, session);
        logger.info(`[repair-pi-ledger] Re-posted ledger for ${inv.invoiceNumber}, voucherId: ${vId}`);

        await session.commitTransaction();
        res.status(200).send(new ApiResponse(200, {
            invoiceNumber: inv.invoiceNumber,
            newVoucherId: vId
        }, `Ledger successfully re-posted for ${inv.invoiceNumber}`));
    } catch (error) {
        await session.abortTransaction();
        logger.error('[repair-pi-ledger] Error:', error);
        res.status(500).send(new ApiResponse(500, null, 'Repair failed: ' + error.message));
    } finally {
        session.endSession();
    }
});

export default router;
