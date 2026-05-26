import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/tcs.controller.js';

const router = express.Router();
router.use(protect);

router.get('/master/sections', ctrl.getMasterSections);
router.post('/master/sections', ctrl.createMasterSection);
router.patch('/master/sections/:sectionCode', ctrl.updateMasterSection);

router.post('/preview', ctrl.postPreview);

router.get('/deductions', ctrl.getDeductions);
router.post('/deductions', ctrl.createDeduction);
router.patch('/deductions/:id', ctrl.updateDeduction);
router.delete('/deductions/:id', ctrl.deleteDeduction);

router.get('/challans', ctrl.getChallans);
router.post('/challans', ctrl.createChallan);
router.post('/challans/:id/mark-paid', ctrl.markChallanPaid);

router.get('/reports/quarterly-summary', ctrl.getQuarterlySummary);
router.get('/reports/buyer-summary', ctrl.getBuyerWiseSummary);
router.get('/dashboard', ctrl.getDashboard);

export default router;
