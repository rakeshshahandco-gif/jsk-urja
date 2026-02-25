import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as itemTypeController from '../../controllers/itemType.controller.js';

const router = express.Router();

router.get('/', protect, itemTypeController.getItemTypes);
router.post('/', protect, itemTypeController.createItemType);
router.patch('/:id', protect, itemTypeController.updateItemType);
router.delete('/:id', protect, itemTypeController.deleteItemType);

export default router;
