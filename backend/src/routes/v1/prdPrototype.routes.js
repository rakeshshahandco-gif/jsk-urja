import express from 'express';
const router = express.Router();
import * as prdPrototypeController  from '../../controllers/prdPrototype.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';

router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'hardware_dev', 'firmware_dev', 'production_user']));

router.post('/', prdPrototypeController.createPrdPrototype);
router.get('/', prdPrototypeController.getPrdPrototypes);
router.put('/:id', prdPrototypeController.updatePrdPrototype);
router.delete('/:id', prdPrototypeController.deletePrdPrototype);

export default router;
