import express from 'express';
import multer from 'multer';
import {
    uploadImport,
    listImports,
    deleteImport,
    getWorkspace,
    runMatching,
    approveMatches,
    approveCombo,
    manualLink,
    rejectMatch,
    ignoreLine,
    markBankCharge,
    undoReconciliation,
    getImportLines,
    listReconciled,
    reportSummary,
    reportUnreconciled,
    reportBookVsBank,
    reportClearedPending,
    reportDateWise,
    reportManual,
    reportCharges,
    reportReconciliationStatement,
    reportImportHistory,
} from '../../controllers/bankReconciliation.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(protect);

router.post('/imports', upload.single('file'), uploadImport);
router.get('/imports', listImports);
router.delete('/imports/:importId', authorize('admin', 'superadmin'), deleteImport);
router.get('/imports/:importId/lines', getImportLines);
router.get('/workspace', getWorkspace);
router.post('/run-matching', runMatching);
router.post('/approve', approveMatches);
router.post('/approve-combo', approveCombo);
router.post('/manual-link', manualLink);
router.get('/reconciled', listReconciled);
router.post('/reject', rejectMatch);
router.post('/ignore', ignoreLine);
router.post('/mark-bank-charge', markBankCharge);
router.post('/:id/undo', authorize('admin', 'superadmin'), undoReconciliation);

router.get('/reports/summary', reportSummary);
router.get('/reports/unreconciled', reportUnreconciled);
router.get('/reports/book-vs-bank-balance', reportBookVsBank);
router.get('/reports/cleared-vs-pending', reportClearedPending);
router.get('/reports/date-wise', reportDateWise);
router.get('/reports/manual-adjustments', reportManual);
router.get('/reports/bank-charges', reportCharges);
router.get('/reports/reconciliation-statement', reportReconciliationStatement);
router.get('/reports/import-history', reportImportHistory);

export default router;
