import express from 'express';
import * as controller from '../../controllers/voucher.controller.js';
import { protect, checkPermission, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

/**
 * Dynamic permission check based on voucher nature
 */
const checkVoucherAction = (action) => (req, res, next) => {
    const nature = req.body.nature || req.query.nature || 'Receipt';
    const natureKey = nature.toLowerCase() === 'receipt' ? 'receipt_entry' : 
                     nature.toLowerCase() === 'payment' ? 'payment_entry' :
                     nature.toLowerCase() === 'journal' ? 'journal_entry' :
                     nature.toLowerCase() === 'expense' ? 'expense_entry' :
                     nature.toLowerCase() === 'debit note' ? 'debit_notes' :
                     nature.toLowerCase() === 'credit note' ? 'credit_notes' : 'receipt_entry';
    
    return checkPermission(`voucher_entry.${natureKey}.${action}`)(req, res, next);
};

router.route('/')
    .post(checkVoucherAction('add'), controller.createVoucher)
    .get(checkVoucherAction('view'), controller.getVouchers);

router.route('/:id')
    .get(checkVoucherAction('view'), controller.getVoucher)
    .patch(checkVoucherAction('edit'), controller.updateVoucher);

router.post('/:id/cancel', checkVoucherAction('cancel'), controller.cancelVoucher);
router.post('/:id/reverse', protect, controller.reverseVoucher);
router.get('/reversing/pending', protect, controller.getPendingReversingJournals);

export default router;
