import express from 'express';
const router = express.Router();
import * as prdIssueController  from '../../controllers/prdIssue.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';
import { prdUpload }  from '../../middlewares/prdUpload.middleware.js';

router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head', 'production_user']));

router.post('/', prdUpload.array('attachments', 10), prdIssueController.createIssue);
router.get('/', prdIssueController.getIssues);
router.get('/:id', prdIssueController.getIssue);
router.put('/:id', prdUpload.array('attachments', 10), prdIssueController.updateIssue);
router.delete('/:id', prdIssueController.deleteIssue);

export default router;
