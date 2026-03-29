import express from 'express';
const router = express.Router();
import * as prdApprovalController  from '../../controllers/prdApproval.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';

router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'qa_head', 'management_viewer']));

router.post('/', prdApprovalController.createApproval);
router.get('/', prdApprovalController.getApprovals);
router.put('/:id', prdApprovalController.updateApproval);

export default router;
