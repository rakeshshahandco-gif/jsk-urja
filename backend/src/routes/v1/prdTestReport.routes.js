import express from 'express';
const router = express.Router();
import * as prdTestReportController  from '../../controllers/prdTestReport.controller.js';
import { requirePrdRole }  from '../../middlewares/prdAuth.middleware.js';
import { prdUpload }  from '../../middlewares/prdUpload.middleware.js';

router.use(requirePrdRole(['super_admin', 'admin', 'rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head']));

router.post('/', prdUpload.array('attachments', 10), prdTestReportController.createTestReport);
router.get('/', prdTestReportController.getTestReports);
router.get('/:id', prdTestReportController.getTestReport);
router.put('/:id', prdUpload.array('attachments', 10), prdTestReportController.updateTestReport);
router.delete('/:id', prdTestReportController.deleteTestReport);

export default router;
