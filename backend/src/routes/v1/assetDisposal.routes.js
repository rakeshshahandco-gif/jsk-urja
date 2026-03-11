import express from 'express';
import * as disposalController from '../../controllers/assetDisposal.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.post('/', disposalController.disposeAsset);

export default router;
