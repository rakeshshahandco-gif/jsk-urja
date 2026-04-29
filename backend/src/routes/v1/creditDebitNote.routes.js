import express from 'express';
import { 
    createCreditDebitNote, 
    getCreditDebitNotes, 
    getCreditDebitNoteById, 
    updateCreditDebitNote, 
    finalizeCreditDebitNote, 
    cancelCreditDebitNote, 
    deleteCreditDebitNote 
} from '../../controllers/creditDebitNote.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createCreditDebitNote)
    .get(getCreditDebitNotes);

router.route('/:id')
    .get(getCreditDebitNoteById)
    .patch(updateCreditDebitNote)
    .delete(deleteCreditDebitNote);

router.post('/:id/finalize', finalizeCreditDebitNote);
router.post('/:id/cancel', cancelCreditDebitNote);

export default router;
