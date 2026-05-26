import express from 'express';
import * as accountReportController from '../../controllers/accountingReport.controller.js';
import { getAuditLogs } from '../../controllers/security.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Existing reports
router.get('/profit-loss', accountReportController.getProfitAndLossReport);
router.get('/balance-sheet', accountReportController.getBalanceSheetReport);
router.get('/trial-balance', accountReportController.getTrialBalanceReport);
router.get('/product-profitability', accountReportController.getProductWiseProfitability);
router.get('/replacement-report', accountReportController.getReplacementReport);
router.get('/sample-conversion-report', accountReportController.getSampleConversionReport);

// New reports
router.get('/cash-flow', accountReportController.getCashFlowReport);
router.get('/comparative-pl', accountReportController.getComparativePL);
router.get('/comparative-bs', accountReportController.getComparativeBS);
router.get('/ageing', accountReportController.getAgeingAnalysis);
router.get('/msme', accountReportController.getMsmeReport);
router.get('/ratio-analysis', accountReportController.getRatioAnalysis);
router.get('/fund-flow', accountReportController.getFundFlowStatement);
router.get('/interest-on-overdue', accountReportController.getInterestOnOverdue);
router.get('/audit-trail', getAuditLogs);

export default router;
