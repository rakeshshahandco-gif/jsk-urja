import express from 'express';
import {
    createFailure,
    getFailures,
    getFailureById,
    updateFailure
} from '../../controllers/productionFailure.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createFailure)
    .get(getFailures);

router.route('/:id')
    .get(getFailureById)
    .put(updateFailure);

export default router;
