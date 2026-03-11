import express from 'express';
import {
    createMaterialIssue,
    getMaterialIssues
} from '../../controllers/reworkMaterialIssue.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createMaterialIssue)
    .get(getMaterialIssues);

export default router;
