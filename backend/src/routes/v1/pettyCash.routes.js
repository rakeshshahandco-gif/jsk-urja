import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { pettyCashImportUpload } from '../../middlewares/pettyCashUpload.middleware.js';
import { voucherAttachmentUpload } from '../../middlewares/voucherAttachmentUpload.middleware.js';
import pettyCashValidation from '../../validations/pettyCash.validation.js';
import * as pettyCashController from '../../controllers/pettyCash.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireCompanyFeature('accounting.enablePettyCash'));

const pc = (action) => checkPermission(`voucher_entry.petty_cash.${action}`);

router.get('/ledgers', pc('view'), pettyCashController.listLedgers);
router.get('/ledgers/export', pc('export'), pettyCashController.exportExpenseLedgers);
router.get('/settings', pc('view'), pettyCashController.getSettings);
router.put('/settings', pc('edit'), validate(pettyCashValidation.settings), pettyCashController.saveSettings);

router.get('/template', pc('import'), pettyCashController.downloadTemplate);
router.post(
    '/import',
    pc('import'),
    pettyCashImportUpload.single('file'),
    validate(pettyCashValidation.importUpload),
    pettyCashController.uploadImport,
);
router.post('/import/:batchId/approve', pc('approve'), validate(pettyCashValidation.approveImport), pettyCashController.approveImport);

router.get('/entries', pc('view'), validate(pettyCashValidation.listEntries), pettyCashController.listEntries);
router.get('/entries/:id', pc('view'), pettyCashController.getEntry);
router.post('/entries', pc('add'), validate(pettyCashValidation.createEntry), pettyCashController.createEntry);
router.post('/entries/:id/attach', pc('add'), voucherAttachmentUpload.single('file'), pettyCashController.attachFile);

router.get('/reports', pc('view'), validate(pettyCashValidation.report), pettyCashController.getReport);
router.get('/reports/export', pc('export'), validate(pettyCashValidation.report), pettyCashController.exportReport);
router.post('/recalculate', pc('edit'), pettyCashController.recalculateBalances);

export default router;