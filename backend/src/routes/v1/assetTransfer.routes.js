import express from 'express';
import * as transferController from '../../controllers/assetTransfer.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.post('/', transferController.createTransfer);
router.get('/asset/:assetId', transferController.getTransfersByAsset);

export default router;
