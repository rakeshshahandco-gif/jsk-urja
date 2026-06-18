import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import { voucherAttachmentUpload } from '../../middlewares/voucherAttachmentUpload.middleware.js';
import voucherAttachmentValidation from '../../validations/voucherAttachment.validation.js';
import * as voucherAttachmentController from '../../controllers/voucherAttachment.controller.js';

const router = express.Router();

router.use(protect);
router.use(requireCompanyFeature('purchase.enableDocumentAttachments'));

router.get('/search', validate(voucherAttachmentValidation.search), voucherAttachmentController.searchVouchers);
router.get('/missing', validate(voucherAttachmentValidation.missing), voucherAttachmentController.missingReport);
router.get('/summary', voucherAttachmentController.summaryStats);
router.get('/', validate(voucherAttachmentValidation.list), voucherAttachmentController.listAttachments);

router.get(
    '/voucher/:voucherType/:voucherId',
    validate(voucherAttachmentValidation.listByVoucher),
    voucherAttachmentController.listByVoucher,
);

router.post(
    '/upload',
    validate(voucherAttachmentValidation.upload),
    voucherAttachmentUpload.single('file'),
    voucherAttachmentController.uploadAttachment,
);

router.delete('/:id', validate(voucherAttachmentValidation.remove), voucherAttachmentController.removeAttachment);

export default router;
