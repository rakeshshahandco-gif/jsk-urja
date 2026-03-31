import express from 'express';
const router = express.Router();
import { protect } from '../../middlewares/auth.middleware.js';
import * as prdChangeLogController  from '../../controllers/prdChangeLog.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';
import { prdUpload }  from '../../middlewares/prdUpload.middleware.js';

router.use(protect);
router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'hardware_dev', 'firmware_dev', 'qa_head']));

router.post('/', prdUpload.array('attachments', 10), prdChangeLogController.createChangeLog);
router.get('/', prdChangeLogController.getChangeLogs);
router.get('/:id', prdChangeLogController.getChangeLog);
router.put('/:id', prdUpload.array('attachments', 10), prdChangeLogController.updateChangeLog);
router.delete('/:id', prdChangeLogController.deleteChangeLog);

export default router;
