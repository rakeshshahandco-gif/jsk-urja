import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/salesConversion.controller.js';

const router = express.Router();

// All routes require authentication. Using 'protect' only (same pattern as other analytics routes).
// Admins and Managers can view all; Salesperson sees only their own data via service-level filtering.

router.get('/funnel',               protect, checkPermission('mis.sales_conversion.view'), ctrl.getSalesConversionFunnel);
router.get('/sample-conversion',    protect, checkPermission('mis.sales_conversion.view'), ctrl.getSampleConversionAnalysis);
router.get('/non-converted-samples',protect, checkPermission('mis.sales_conversion.view'), ctrl.getNonConvertedSamples);
router.get('/repeat-business',      protect, checkPermission('mis.sales_conversion.view'), ctrl.getRepeatBusinessAnalysis);
router.get('/item-wise',            protect, checkPermission('mis.sales_conversion.view'), ctrl.getItemWiseSalesAnalysis);
router.get('/customer-wise',        protect, checkPermission('mis.sales_conversion.view'), ctrl.getCustomerWiseSalesAnalysis);
router.get('/salesperson-matrix',   protect, checkPermission('mis.sales_conversion.view'), ctrl.getSalespersonConversionMatrix);
router.get('/payment-analysis',     protect, checkPermission('mis.sales_conversion.view'), ctrl.getPaymentReceivedAnalysis);

export default router;
