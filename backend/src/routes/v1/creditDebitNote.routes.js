import express from 'express';
import {
    createCreditDebitNote,
    getCreditDebitNotes,
    getCreditDebitNoteById,
    updateCreditDebitNote,
    finalizeCreditDebitNote,
    cancelCreditDebitNote,
    deleteCreditDebitNote,
    getAvailableCustomerCreditNotes,
    applyCreditNoteAllocations,
    reverseCreditNoteAllocation,
    rebuildCreditNoteBalance,
    getCreditNoteLedgerSetup,
    getCreditNoteLedgerConfig,
    searchCreditNoteMappingLedgers,
    selectCreditNoteExistingLedger,
    createCreditNoteConfigLedger,
    useCreditNoteDefaultSystemLedger,
    updateCreditNoteReasonMappings,
    ensureCreditNoteSalesReturnLedger,
    mapCreditNoteSalesReturnLedger,
    listSalesReturnMappingCandidates,
} from '../../controllers/creditDebitNote.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createCreditDebitNote)
    .get(getCreditDebitNotes);

// Phase 4A — must be before /:id
router.get('/available-for-customer', getAvailableCustomerCreditNotes);
router.post('/allocate', applyCreditNoteAllocations);
router.post('/allocations/:id/reverse', reverseCreditNoteAllocation);

router.get('/ledger-config', getCreditNoteLedgerConfig);
router.get('/ledger-config/search', searchCreditNoteMappingLedgers);
router.post('/ledger-config/select-existing', selectCreditNoteExistingLedger);
router.post('/ledger-config/create-new', createCreditNoteConfigLedger);
router.post('/ledger-config/use-default', useCreditNoteDefaultSystemLedger);
router.put('/ledger-config/reason-mappings', updateCreditNoteReasonMappings);

router.get('/ledger-setup/sales-return', getCreditNoteLedgerSetup);
router.get('/ledger-setup/sales-return/candidates', listSalesReturnMappingCandidates);
router.post('/ledger-setup/sales-return/ensure', ensureCreditNoteSalesReturnLedger);
router.post('/ledger-setup/sales-return/map', mapCreditNoteSalesReturnLedger);

router.route('/:id')
    .get(getCreditDebitNoteById)
    .patch(updateCreditDebitNote)
    .put(updateCreditDebitNote)
    .delete(deleteCreditDebitNote);

router.post('/:id/finalize', finalizeCreditDebitNote);
router.post('/:id/cancel', cancelCreditDebitNote);
router.post('/:id/rebuild-balance', rebuildCreditNoteBalance);

export default router;
