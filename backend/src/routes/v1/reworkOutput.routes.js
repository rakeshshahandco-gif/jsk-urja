import express from 'express';
import {
    createOutput,
    getOutputs
} from '../../controllers/reworkOutput.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createOutput)
    .get(getOutputs);

export default router;
