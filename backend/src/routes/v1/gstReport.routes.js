import express from 'express';
import multer from 'multer';
import * as gstCtrl from '../../controllers/gstReport.controller.js';
import { protect, authorize, checkPermission } from '../../middlewares/auth.middleware.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });


const router = express.Router();
router.use(protect);

// E-Invoice
router.get('/einvoice/:invoiceId/payload', gstCtrl.getEInvoicePayload);
router.post('/einvoice/:invoiceId/generate-irn', gstCtrl.postGenerateIrn);

router.get('/preview',  checkPermission('gst.gstr1.view'), gstCtrl.getGSTR1Preview);
router.get('/validate', checkPermission('gst.gstr1.view'), gstCtrl.getGSTR1Validation);
router.get('/download', checkPermission('gst.gstr1.export'), gstCtrl.downloadGSTR1Excel);
router.get('/download-json', checkPermission('gst.gstr1.export'), gstCtrl.downloadGSTR1Json);
router.get('/gstr3b-summary', checkPermission('gst.gstr3b.view'), gstCtrl.getGSTR3BSummary);
router.get('/gstr3b-adjustment', checkPermission('gst.gstr3b.view'), gstCtrl.getGSTR3BAdjustment);
router.post('/gstr3b-adjustment', checkPermission('gst.gstr3b.view'), gstCtrl.saveGSTR3BAdjustment);

// New Reports
router.get('/itc-register', checkPermission('gst.itc_register.view'), gstCtrl.getItcRegister);
router.get('/payable-summary', checkPermission('admin.company_profile.view'), gstCtrl.getGstPayableSummary);
router.get('/hsn-summary', checkPermission('admin.company_profile.view'), gstCtrl.getHsnSummary);
router.get('/ledger', checkPermission('admin.company_profile.view'), gstCtrl.getGstLedger);

// GSTR-9 Annual Return
router.get('/gstr9-summary',   checkPermission('gst.gstr3b.view'), gstCtrl.getGSTR9Summary);
router.get('/gstr9-download',  checkPermission('gst.gstr3b.view'), gstCtrl.downloadGSTR9Excel);
router.post('/gstr9-import',   checkPermission('gst.gstr3b.view'), upload.single('file'), gstCtrl.importGstr9Portal);
router.get('/gstr9-imports',   checkPermission('gst.gstr3b.view'), gstCtrl.listGstr9PortalImports);
router.delete('/gstr9-imports/:id', checkPermission('gst.gstr3b.view'), gstCtrl.removeGstr9PortalImport);
router.get('/gstr9-reconcile', checkPermission('gst.gstr3b.view'), gstCtrl.getGstr9Reconciliation);

// Admin Utility for Missing Place of Supply
router.get('/missing-pos-preview', authorize('superadmin', 'admin'), gstCtrl.getMissingPosPreview);
router.post('/sync-missing-pos', authorize('superadmin', 'admin'), gstCtrl.syncMissingPos);

// Controlled Fix from Customer Master (never silent cascade)
router.post('/fix-from-master/bulk-preview', checkPermission('gst.gstr1.invoice_correction'), gstCtrl.bulkPreviewFixFromCustomerMaster);
router.get('/fix-from-master/:invoiceId/preview', checkPermission('gst.gstr1.invoice_correction'), gstCtrl.previewFixFromCustomerMaster);
router.post('/fix-from-master/:invoiceId/apply', checkPermission('gst.gstr1.invoice_correction'), gstCtrl.applyFixFromCustomerMaster);
router.get('/customers/:customerId/affected-invoices', checkPermission('gst.gstr1.view'), gstCtrl.getAffectedInvoicesMissingGst);
router.post('/gstr1-period/mark-filed', checkPermission('gst.gstr1.invoice_correction'), gstCtrl.markGstr1PeriodFiled);

export default router;
