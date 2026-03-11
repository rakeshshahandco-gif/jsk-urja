import express from 'express';
import {
    createRetest,
    getRetests
} from '../../controllers/retestConfirmation.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createRetest)
    .get(getRetests);

export default router;
