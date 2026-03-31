import express from 'express';
const router = express.Router();
import { protect } from '../../middlewares/auth.middleware.js';
import * as prdDesignController  from '../../controllers/prdDesign.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';
import { prdUpload }  from '../../middlewares/prdUpload.middleware.js';

router.use(protect);
router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'hardware_dev', 'firmware_dev']));

router.post('/', prdUpload.array('attachments', 10), prdDesignController.createPrdDesign);
router.get('/', prdDesignController.getPrdDesigns);
router.put('/:id', prdUpload.array('attachments', 10), prdDesignController.updatePrdDesign);
router.delete('/:id', prdDesignController.deletePrdDesign);

export default router;
