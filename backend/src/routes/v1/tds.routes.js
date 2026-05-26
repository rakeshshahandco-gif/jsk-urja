import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/tds.controller.js';

const router = express.Router();
router.use(protect);

router.get('/master/sections', ctrl.getTdsMasterSections);
router.get('/master/sections/:sectionCode/payable-suggestion', ctrl.getTdsPayableLedgerSuggestion);
router.post('/master/sections/:sectionCode/payable-ledger', ctrl.postTdsSectionPayableLedger);
router.get('/master/sections/:sectionCode', ctrl.getTdsMasterSectionByCode);
router.patch('/master/sections/:sectionCode', ctrl.patchTdsMasterSection);
router.post('/payment-preview', ctrl.postPaymentTdsPreview);
router.post('/expense-voucher/preview', ctrl.postExpenseVoucherTdsPreview);
router.post('/purchase-invoice/preview', ctrl.postPurchaseInvoiceTdsPreview);

router.get('/dashboard', ctrl.getDashboard);
router.get('/deduction-register', ctrl.getDeductionRegister);
router.get('/deductions', ctrl.getDeductions);
router.post('/deductions/from-payment', ctrl.postDeductionFromPayment);
router.post('/deductions', ctrl.postDeduction);
router.patch('/deductions/:id', ctrl.patchDeduction);
router.delete('/deductions/:id', ctrl.removeDeduction);

router.get('/challans/unpaid', ctrl.getUnpaidTdsForChallan);
router.get('/challans/register', ctrl.getChallanRegister);
router.get('/challans/e-pay-url', ctrl.getChallanEPayUrl);
router.get('/challans', ctrl.getChallans);
router.get('/challans/:id/pdf', ctrl.getChallanPdf);
router.get('/challans/:id/itns281', ctrl.getChallanItns281);
router.get('/challans/:id/itns281/pdf', ctrl.getChallanItns281Pdf);
router.post('/challans/itns281/preview', ctrl.postChallanItns281Preview);
router.post('/challans/itns281/pdf', ctrl.postChallanItns281Pdf);
router.get('/challans/:id', ctrl.getChallanById);
router.post('/challans', ctrl.postChallan);
router.post('/challans/:id/mark-paid', ctrl.postChallanMarkPaid);
router.post('/challans/:id/link', ctrl.postChallanLink);

router.post('/returns/preview', ctrl.postReturnPreview);
router.post('/returns/export', ctrl.postReturnExport);
router.get('/returns', ctrl.getReturns);

router.post('/form16a/issue', ctrl.postForm16aIssue);
router.get('/form16a', ctrl.getForm16aList);
router.get('/form16a/:id/pdf', ctrl.getForm16aPdf);

router.get('/settings', ctrl.getTdsSettings);
router.patch('/settings', ctrl.patchTdsSettings);

router.get('/reports/threshold-tracking', ctrl.getThresholdTrackingReport);
router.get('/reports/vendor-summary', ctrl.getVendorWiseTdsSummary);
router.get('/reports/pending-deductions', ctrl.getPendingTdsDeductionReport);
router.get('/reports/near-limit', ctrl.getNearLimitReport);
router.get('/reports/deducted-not-paid', ctrl.getDeductedNotPaidReport);
router.get('/reports/exceptions', ctrl.getTdsExceptionReport);
router.get('/reports/payable', ctrl.getPayableReport);
router.get('/reports/section-summary', ctrl.getSectionWiseReport);
router.get('/reports/deductee-summary', ctrl.getDeducteeWiseReport);
router.get('/reports/pan-missing', ctrl.getPanMissingReport);
router.get('/reports/monthly-liability', ctrl.getMonthlyLiabilityReport);
router.get('/reports/quarter-summary', ctrl.getQuarterWiseReport);
router.get('/reports/lower-deduction', ctrl.getLowerDeductionReport);
router.get('/reports/challan-reconciliation', ctrl.getChallanReconciliationReport);
router.get('/audit-logs', ctrl.getTdsAuditLogs);

export default router;
