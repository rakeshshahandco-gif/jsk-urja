import express from 'express';
const router = express.Router();
import { protect } from '../../middlewares/auth.middleware.js';
import * as prdAuditController  from '../../controllers/prdAudit.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';

router.use(protect);
router.use(requirePrdRole(['super_admin', 'admin', 'qa_head', 'rd_manager', 'management_viewer']));

router.get('/project/:projectId', prdAuditController.getProjectAudits);
router.get('/system', prdAuditController.getSystemAudits);

export default router;
