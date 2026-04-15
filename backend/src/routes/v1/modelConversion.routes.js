import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createModelConversion, getModelConversions } from '../../controllers/modelConversion.controller.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createModelConversion)
    .get(getModelConversions);

export default router;
