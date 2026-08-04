import express from 'express';
import { protect, authorize, checkPermission } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/rcm.controller.js';

const router = express.Router();

router.use(protect);

/** Preview-only RCM evaluation — no posting side effects */
router.post('/evaluate', ctrl.evaluateRcm);

/** Phase 2B-A — accounting simulation only (no journals) */
router.post('/simulate-accounting', ctrl.simulateRcmAccountingPreview);
router.get('/ledger-design', ctrl.getRcmLedgerDesign);

/** Phase 2B-B — confirm / eligibility / ensure ledgers / post / reverse */
router.post('/confirm', checkPermission('gst.rcm.confirm'), ctrl.confirmRcmDecision);
router.post('/posting-eligibility', checkPermission('gst.rcm.view_accounting_preview'), ctrl.getPostingEligibility);
router.post('/ensure-ledgers', checkPermission('gst.rcm.post_liability'), ctrl.ensureRcmLedgersController);
router.post('/post-liability', checkPermission('gst.rcm.post_liability'), ctrl.postRcmLiabilityController);
router.get('/postings', checkPermission('gst.rcm.view_accounting_preview'), ctrl.listRcmPostings);
router.get('/postings/:id', checkPermission('gst.rcm.view_accounting_preview'), ctrl.getRcmPostingById);
router.post('/postings/:id/reverse', checkPermission('gst.rcm.reverse'), ctrl.reverseRcmLiabilityController);

/** Phase 2B-C — RCM tax payment recording (no ITC) */
router.post('/postings/:id/record-payment', checkPermission('gst.rcm.record_payment'), ctrl.recordRcmTaxPaymentController);
router.get('/postings/:id/payments', checkPermission('gst.rcm.view_payment'), ctrl.listRcmTaxPaymentsController);
router.post('/payments/:paymentId/reverse', checkPermission('gst.rcm.reverse_payment'), ctrl.reverseRcmTaxPaymentController);

/** Phase 2C — ITC eligibility review + controlled release (no GSTR-3B auto-update) */
router.get('/postings/:id/itc-review', checkPermission('gst.rcm.view_itc_review'), ctrl.getItcReviewController);
router.post('/postings/:id/itc-review', checkPermission('gst.rcm.review_itc'), ctrl.saveItcReviewController);
router.post('/postings/:id/itc-release-preview', checkPermission('gst.rcm.view_itc_review'), ctrl.previewItcReleaseController);
router.post('/postings/:id/release-itc', checkPermission('gst.rcm.release_itc'), ctrl.releaseItcController);
router.get('/postings/:id/itc-releases', checkPermission('gst.rcm.view_itc_review'), ctrl.listItcReleasesController);
router.post('/itc-releases/:releaseId/reverse', checkPermission('gst.rcm.reverse_itc'), ctrl.reverseItcReleaseController);
router.post('/postings/:id/reclassify-ineligible', checkPermission('gst.rcm.release_itc'), ctrl.reclassifyIneligibleController);

/** Phase 2D — GSTR-3B mapping / reconciliation / controlled draft inclusion (no accounting JVs) */
router.get('/gstr3b-reconciliation', checkPermission('gst.rcm.view_reconciliation'), ctrl.getRcmGstr3bReconciliationController);
router.get('/gstr3b-reconciliation/export', checkPermission('gst.rcm.view_reconciliation'), ctrl.exportRcmReconciliationController);
router.post('/gstr3b-reconciliation/prepare', checkPermission('gst.rcm.prepare_return_mapping'), ctrl.prepareRcmReturnMappingController);
router.post('/gstr3b-reconciliation/review', checkPermission('gst.rcm.review_return_mapping'), ctrl.reviewRcmReturnMappingController);
router.post('/gstr3b-reconciliation/approve', checkPermission('gst.rcm.approve_return_mapping'), ctrl.approveRcmReturnMappingController);
router.post('/gstr3b-reconciliation/include', checkPermission('gst.rcm.include_in_gstr3b'), ctrl.includeRcmInGstr3bController);
router.post('/gstr3b-reconciliation/lock', checkPermission('gst.rcm.lock_period'), ctrl.lockRcmGstr3bPeriodController);
router.post('/gstr3b-reconciliation/amendment', checkPermission('gst.rcm.create_amendment'), ctrl.createRcmAmendmentController);

router.get('/rules', checkPermission('admin'), ctrl.listRcmRules);
router.get('/rules/:id', checkPermission('admin'), ctrl.getRcmRule);
router.post('/rules', authorize('admin', 'superadmin'), ctrl.createRcmRule);
router.patch('/rules/:id', authorize('admin', 'superadmin'), ctrl.updateRcmRule);

export default router;
