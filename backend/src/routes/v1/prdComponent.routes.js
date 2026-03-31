import express from 'express';
const router = express.Router();
import { protect } from '../../middlewares/auth.middleware.js';
import * as prdComponentController  from '../../controllers/prdComponent.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';

router.use(protect);
router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'hardware_dev', 'firmware_dev']));

router.post('/', prdComponentController.createPrdComponent);
router.get('/', prdComponentController.getPrdComponents);
router.get('/:id', prdComponentController.getPrdComponent);
router.put('/:id', prdComponentController.updatePrdComponent);
router.delete('/:id', prdComponentController.deletePrdComponent);

export default router;
