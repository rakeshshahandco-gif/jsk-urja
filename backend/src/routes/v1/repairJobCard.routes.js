import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createRepairJobCard, getRepairJobCards, getRepairJobCard, updateRepairJobCard, deleteRepairJobCard } from '../../controllers/repairJobCard.controller.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getRepairJobCards).post(createRepairJobCard);
router.route('/:id').get(getRepairJobCard).put(updateRepairJobCard).delete(deleteRepairJobCard);

export default router;
