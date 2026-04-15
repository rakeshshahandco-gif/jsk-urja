import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/salesConversion.controller.js';

const router = express.Router();

// All routes require authentication. Using 'protect' only (same pattern as other analytics routes).
// Admins and Managers can view all; Salesperson sees only their own data via service-level filtering.

router.get('/funnel',               protect, ctrl.getSalesConversionFunnel);
router.get('/sample-conversion',    protect, ctrl.getSampleConversionAnalysis);
router.get('/non-converted-samples',protect, ctrl.getNonConvertedSamples);
router.get('/repeat-business',      protect, ctrl.getRepeatBusinessAnalysis);
router.get('/item-wise',            protect, ctrl.getItemWiseSalesAnalysis);
router.get('/customer-wise',        protect, ctrl.getCustomerWiseSalesAnalysis);
router.get('/salesperson-matrix',   protect, ctrl.getSalespersonConversionMatrix);
router.get('/payment-analysis',     protect, ctrl.getPaymentReceivedAnalysis);

export default router;
