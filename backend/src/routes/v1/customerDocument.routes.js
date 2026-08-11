import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { customerDocumentUpload } from '../../middlewares/customerDocumentUpload.middleware.js';
import customerDocumentValidation from '../../validations/customerDocument.validation.js';
import * as customerDocumentController from '../../controllers/customerDocument.controller.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/kyc-meta', customerDocumentController.getKycMeta);

router.get(
    '/reports/missing-kyc',
    checkPermission('reports.customer_kyc_reports.view'),
    validate(customerDocumentValidation.missingKyc),
    customerDocumentController.missingKyc,
);

router.get(
    '/reports/expiring',
    checkPermission('reports.customer_kyc_reports.view'),
    validate(customerDocumentValidation.expiring),
    customerDocumentController.expiringReport,
);

router.get(
    '/reports/missing/:documentType',
    checkPermission('reports.customer_kyc_reports.view'),
    validate(customerDocumentValidation.missingType),
    customerDocumentController.missingByType,
);

router.get(
    '/:customerId',
    checkPermission('customers.customer_documents.view'),
    validate(customerDocumentValidation.listByCustomer),
    customerDocumentController.listDocuments,
);

router.post(
    '/:customerId/upload',
    checkPermission('customers.customer_documents.upload'),
    // Multer must run before validate so multipart fields (documentType) are on req.body
    customerDocumentUpload.single('file'),
    validate(customerDocumentValidation.upload),
    customerDocumentController.uploadDocument,
);

router.get(
    '/file/:documentId',
    checkPermission('customers.customer_documents.view'),
    validate(customerDocumentValidation.getDocument),
    customerDocumentController.getDocument,
);

router.put(
    '/file/:documentId/replace',
    checkPermission('customers.customer_documents.upload'),
    customerDocumentUpload.single('file'),
    validate(customerDocumentValidation.replace),
    customerDocumentController.replaceDocument,
);

router.patch(
    '/file/:documentId',
    checkPermission('customers.customer_documents.upload'),
    validate(customerDocumentValidation.updateMeta),
    customerDocumentController.updateMeta,
);

router.delete(
    '/file/:documentId',
    checkPermission('customers.customer_documents.delete'),
    validate(customerDocumentValidation.remove),
    customerDocumentController.removeDocument,
);

export default router;
