import express from 'express';
import * as rfqCtrl from '../../controllers/purchaseRfq.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';

const router = express.Router();
const rfqFeature = requireCompanyFeature('purchase.enableRfqSupplierQuotation');

router.use(protect);
router.use(rfqFeature);

router.get('/reports', rfqCtrl.getRfqReports);

router.route('/')
    .get(rfqCtrl.listPurchaseRfqs)
    .post(rfqCtrl.createPurchaseRfq);

router.route('/quotations')
    .get(rfqCtrl.listSupplierQuotations)
    .post(rfqCtrl.upsertSupplierQuotation);

router.get('/quotations/:id', rfqCtrl.getSupplierQuotationById);

router.route('/:id')
    .get(rfqCtrl.getPurchaseRfqById)
    .put(rfqCtrl.updatePurchaseRfq);

router.post('/:id/send', rfqCtrl.sendPurchaseRfq);
router.post('/:id/cancel', rfqCtrl.cancelPurchaseRfq);
router.get('/:id/comparison', rfqCtrl.getRfqComparison);
router.put('/:id/selection', rfqCtrl.saveRfqSelection);
router.post('/:id/approve', rfqCtrl.approvePurchaseRfq);
router.post('/:id/convert-to-po', rfqCtrl.convertRfqToPo);

export default router;
