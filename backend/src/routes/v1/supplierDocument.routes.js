import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { supplierDocumentUpload } from '../../middlewares/supplierDocumentUpload.middleware.js';
import supplierDocumentValidation from '../../validations/supplierDocument.validation.js';
import * as supplierDocumentController from '../../controllers/supplierDocument.controller.js';

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/kyc-meta', supplierDocumentController.getKycMeta);

router.get(
    '/reports/missing-kyc',
    checkPermission('reports.supplier_kyc_reports.view'),
    validate(supplierDocumentValidation.missingKyc),
    supplierDocumentController.missingKyc,
);

router.get(
    '/reports/expiring',
    checkPermission('reports.supplier_kyc_reports.view'),
    validate(supplierDocumentValidation.expiring),
    supplierDocumentController.expiringReport,
);

router.get(
    '/reports/missing/:documentType',
    checkPermission('reports.supplier_kyc_reports.view'),
    validate(supplierDocumentValidation.missingType),
    supplierDocumentController.missingByType,
);

router.get(
    '/:supplierId',
    checkPermission('purchase.supplier_documents.view'),
    validate(supplierDocumentValidation.listBySupplier),
    supplierDocumentController.listDocuments,
);

router.post(
    '/:supplierId/upload',
    checkPermission('purchase.supplier_documents.upload'),
    validate(supplierDocumentValidation.upload),
    supplierDocumentUpload.single('file'),
    supplierDocumentController.uploadDocument,
);

router.get(
    '/file/:documentId',
    checkPermission('purchase.supplier_documents.view'),
    validate(supplierDocumentValidation.getDocument),
    supplierDocumentController.getDocument,
);

router.put(
    '/file/:documentId/replace',
    checkPermission('purchase.supplier_documents.upload'),
    validate(supplierDocumentValidation.replace),
    supplierDocumentUpload.single('file'),
    supplierDocumentController.replaceDocument,
);

router.patch(
    '/file/:documentId',
    checkPermission('purchase.supplier_documents.upload'),
    validate(supplierDocumentValidation.updateMeta),
    supplierDocumentController.updateMeta,
);

router.delete(
    '/file/:documentId',
    checkPermission('purchase.supplier_documents.delete'),
    validate(supplierDocumentValidation.remove),
    supplierDocumentController.removeDocument,
);

export default router;
