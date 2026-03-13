import express from 'express';
import multer from 'multer';
import { validate } from '../../middlewares/validate.middleware.js';
import bomValidation from '../../validations/bom.validation.js';
import * as bomController from '../../controllers/bom.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.use(protect);

router.get('/export/template', bomController.exportBOMTemplate);
router.post('/import/excel', upload.single('file'), bomController.importBOMsExcel);

router
    .route('/')
    .post(validate(bomValidation.createBOM), bomController.createBOM)
    .get(validate(bomValidation.getBOMs), bomController.getBOMs);

router
    .route('/:id')
    .get(validate(bomValidation.getBOM), bomController.getBOM)
    .put(validate(bomValidation.updateBOM), bomController.updateBOM)
    .delete(validate(bomValidation.deleteBOM), bomController.deleteBOM);

export default router;
