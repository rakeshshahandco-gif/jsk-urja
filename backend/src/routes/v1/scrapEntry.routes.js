import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createScrapEntry, getScrapEntries, getScrapEntry, deleteScrapEntry } from '../../controllers/scrapEntry.controller.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getScrapEntries).post(createScrapEntry);
router.route('/:id').get(getScrapEntry).delete(deleteScrapEntry);

export default router;
