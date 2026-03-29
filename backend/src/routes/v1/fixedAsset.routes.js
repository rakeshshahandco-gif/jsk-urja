import express from 'express';
import multer from 'multer';
import * as fixedAssetController from '../../controllers/fixedAsset.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get('/export-template', fixedAssetController.exportFixedAssetTemplate);
router.post('/import-excel', upload.single('file'), fixedAssetController.importFixedAssetsExcel);

router.route('/')
    .get(fixedAssetController.getAssets)
    .post(fixedAssetController.createAsset);

router.route('/:id')
    .get(fixedAssetController.getAssetById)
    .put(fixedAssetController.updateAsset);

export default router;
