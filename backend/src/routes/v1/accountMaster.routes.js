import express from 'express';
import accountMasterController from '../../controllers/accountMaster.controller.js';
import * as ledgerLinkingController from '../../controllers/ledgerLinking.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/initialize', accountMasterController.initializeMasters);
router.get('/groups', accountMasterController.getGroups);
router.post('/groups', accountMasterController.createGroup);
router.get('/groups/:id', accountMasterController.getGroupById);
router.patch('/groups/:id', accountMasterController.updateGroup);
router.delete('/groups/:id', accountMasterController.deleteGroup);
router.get('/ledgers', accountMasterController.getLedgers);
router.post('/ledgers', accountMasterController.createLedger);
router.patch('/ledgers/:id', accountMasterController.updateLedger);
router.delete('/ledgers/:id', accountMasterController.deleteLedger);

router.post('/ledger-link/manual', accountMasterController.linkEntityLedger);
router.get('/ledger-link/preview', ledgerLinkingController.previewAutoLink);
router.post('/ledger-link/apply', ledgerLinkingController.applyAutoLink);
router.post('/ledger-link/auto-single', ledgerLinkingController.autoLinkSingle);
router.get('/ledger-link/cb-preview', ledgerLinkingController.previewCashBankLink);
router.post('/ledger-link/cb-apply', ledgerLinkingController.applyCashBankLink);

export default router;
