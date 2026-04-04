import { Router } from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import * as payrollController from '../../controllers/payroll.controller.js';

const router = Router();

router.use(protect);

// Only authorized users can process payroll
router.get('/preview', checkPermission('hr.hr_reports.view'), payrollController.generateSalaryPreview);
router.get('/saved', checkPermission('hr.hr_reports.view'), payrollController.getSavedSalaries);
router.post('/save', checkPermission('hr.hr_dashboard.view'), payrollController.saveSalaryBatch);

export default router;
