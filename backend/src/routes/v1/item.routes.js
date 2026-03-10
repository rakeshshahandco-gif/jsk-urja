import express from 'express';
import multer from 'multer';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import itemValidation from '../../validations/item.validation.js';
import * as itemController from '../../controllers/item.controller.js';

const upload = multer({ storage: multer.memoryStorage() });

console.log('ITEM ROUTES LOADED AT', new Date().toISOString());

const router = express.Router();

router.get('/generate-code', protect, itemController.generateCode);
router.get('/export/template', protect, itemController.exportItemTemplate);
router.get('/export/excel', protect, itemController.exportItemsExcel);
router.get('/export/pdf', protect, itemController.exportItemsPDF);
router.post('/import/excel', protect, upload.single('file'), itemController.importItemsExcel);

router
    .route('/')
    .get(protect, itemController.getItems)
    .post(protect, validate(itemValidation.createItem), itemController.createItem);

router
    .route('/:id')
    .get(protect, validate(itemValidation.getItem), itemController.getItem)
    .patch(protect, validate(itemValidation.updateItem), itemController.updateItem)
    .delete(protect, validate(itemValidation.deleteItem), itemController.deleteItem);

export default router;
