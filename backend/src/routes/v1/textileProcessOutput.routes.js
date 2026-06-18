import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { textileDemoOnly } from '../../middlewares/textileDemo.middleware.js';
import textileProcessOutputValidation from '../../validations/textileProcessOutput.validation.js';
import * as ctrl from '../../controllers/textileProcessOutput.controller.js';

const router = express.Router();

router.use(protect);

router.get('/eligibility', ctrl.getEligibility);
router.get('/available', validate(textileProcessOutputValidation.available), ctrl.listAvailable);
router.get('/stock', validate(textileProcessOutputValidation.stock), ctrl.listStock);
router.get('/summary', validate(textileProcessOutputValidation.summary), ctrl.getSummary);
router.get('/trace', validate(textileProcessOutputValidation.trace), ctrl.getTrace);
router.get('/history', validate(textileProcessOutputValidation.history), ctrl.listHistory);
router.get('/reports/pending-next-process', validate(textileProcessOutputValidation.reports), ctrl.getPendingNextProcess);
router.get('/reports/fg-transfers', validate(textileProcessOutputValidation.reports), ctrl.getFgTransfers);
router.post('/consume', validate(textileProcessOutputValidation.consume), ctrl.consume);

router.use('/demo', textileDemoOnly);
router.get('/demo/status', validate(textileProcessOutputValidation.demoStatus), ctrl.getDemoStatus);
router.post('/demo/seed', validate(textileProcessOutputValidation.demoSeed), ctrl.seedDemo);
router.post('/demo/preview', validate(textileProcessOutputValidation.demoPreview), ctrl.previewDemoTransfer);
router.post('/demo/transfer', validate(textileProcessOutputValidation.demoTransfer), ctrl.executeDemoTransfer);
router.post('/demo/reset', validate(textileProcessOutputValidation.demoReset), ctrl.resetDemo);

export default router;
