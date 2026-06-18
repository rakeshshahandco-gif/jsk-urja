import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requireAiSmartImport, checkImportPermission } from '../../middlewares/aiSmartImport.middleware.js';
import { scanEntryUpload } from '../../middlewares/scanEntryUpload.middleware.js';
import * as scanEntryController from '../../controllers/scanEntry.controller.js';

const router = express.Router();

router.use(protect);
router.use(requireAiSmartImport);

const se = (action) => {
    if (action === 'post') return checkImportPermission('approve_post');
    if (action === 'admin_override_duplicate') return checkImportPermission('duplicate_override');
    return checkImportPermission(action);
};

router.post('/upload', se('upload'), scanEntryUpload.single('file'), scanEntryController.uploadSingle);
router.post('/bulk-upload', se('upload'), scanEntryUpload.array('files', 25), scanEntryController.bulkUpload);

router.get('/drafts', se('view'), scanEntryController.listDrafts);
router.get('/drafts/:id', se('view'), scanEntryController.getDraftById);
router.patch('/drafts/:id', se('review'), scanEntryController.updateDraft);
router.delete('/drafts/:id', se('delete'), scanEntryController.deleteDraftNow);

router.post('/drafts/:id/match-supplier', se('review'), scanEntryController.matchSupplier);
router.post('/drafts/:id/rematch-master', se('review'), scanEntryController.rematchMaster);
router.post('/drafts/:id/match-items', se('review'), scanEntryController.matchItems);
router.post('/drafts/:id/validate', se('review'), scanEntryController.validateDraftNow);
router.post('/drafts/:id/save-draft', se('review'), scanEntryController.saveAsDraft);
router.post('/drafts/:id/post', se('post'), scanEntryController.postDraftNow);
router.post('/drafts/:id/repost-ledger', se('post'), scanEntryController.repostLedgerNow);
router.post('/linked-purchase-invoices/:invoiceId/repost-ledger', se('post'), scanEntryController.repostLinkedPurchaseLedger);
router.post('/drafts/:id/reject', se('reject'), scanEntryController.rejectDraftNow);
router.post('/drafts/:id/override-duplicate', se('admin_override_duplicate'), scanEntryController.overrideDuplicateNow);
router.post('/drafts/:id/create-draft-supplier', checkImportPermission('create_draft_ledger'), scanEntryController.createDraftSupplierNow);
router.post('/drafts/:id/approve-pending-master', checkImportPermission('approve_ledger'), scanEntryController.approvePendingMasterNow);

router.get('/items', se('review'), scanEntryController.listItems);
router.get('/keyword-maps', se('review'), scanEntryController.listKeywordMaps);
router.post('/keyword-maps', se('review'), scanEntryController.createKeywordMap);
router.delete('/keyword-maps/:id', se('review'), scanEntryController.deleteKeywordMap);

router.get('/reports/summary', se('view'), scanEntryController.getReports);

export default router;

