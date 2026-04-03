import express from 'express';
import * as accountReportController from '../../controllers/accountingReport.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/profit-loss', accountReportController.getProfitAndLossReport);
router.get('/balance-sheet', accountReportController.getBalanceSheetReport);
router.get('/trial-balance', accountReportController.getTrialBalanceReport);

export default router;
