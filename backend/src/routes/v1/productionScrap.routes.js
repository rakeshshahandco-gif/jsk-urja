import express from 'express';
import {
    createScrap,
    getScraps
} from '../../controllers/productionScrap.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createScrap)
    .get(getScraps);

export default router;
