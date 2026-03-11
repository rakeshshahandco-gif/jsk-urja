import express from 'express';
import * as controller from '../../controllers/ledger.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', controller.getLedgers);
router.get('/report', controller.getLedgerReport);
router.get('/balances', controller.getCashBankBalances);
router.get('/outstanding-summary', controller.getOutstandingSummary);
router.get('/:ledgerId/outstanding', controller.getOutstandingBills);

export default router;
