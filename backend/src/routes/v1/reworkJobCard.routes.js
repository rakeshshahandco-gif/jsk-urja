import express from 'express';
import {
    createJobCard,
    getJobCards,
    getJobCardById,
    updateJobCard
} from '../../controllers/reworkJobCard.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createJobCard)
    .get(getJobCards);

router.route('/:id')
    .get(getJobCardById)
    .put(updateJobCard);

export default router;
