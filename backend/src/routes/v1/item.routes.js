import express from 'express';
import multer from 'multer';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import itemValidation from '../../validations/item.validation.js';
import * as itemController from '../../controllers/item.controller.js';

const upload = multer({ storage: multer.memoryStorage() });

console.log('ITEM ROUTES LOADED AT', new Date().toISOString());

const router = express.Router();

import { Item } from '../../models/item.model.js';
import { ItemGroup } from '../../models/itemGroup.model.js';

router.post('/debug/delete-all', async (req, res) => {
    try {
        await Item.deleteMany({});
        await ItemGroup.deleteMany({});
        res.json({ success: true, message: 'All items and item groups deleted.' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

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
