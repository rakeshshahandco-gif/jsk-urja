import express from 'express';
import * as fixedAssetController from '../../controllers/fixedAsset.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/')
    .get(fixedAssetController.getAssets)
    .post(fixedAssetController.createAsset);

router.route('/:id')
    .get(fixedAssetController.getAssetById)
    .put(fixedAssetController.updateAsset);

export default router;
