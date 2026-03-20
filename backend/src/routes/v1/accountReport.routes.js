import express from 'express';
import * as accountReportController from '../../controllers/accountReport.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/sales-register', accountReportController.getSalesRegister);
router.get('/purchase-register', accountReportController.getPurchaseRegister);
router.get('/day-book', accountReportController.getDayBook);
router.get('/cash-bank-book', accountReportController.getCashBankBook);

export default router;
