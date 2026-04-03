import express from 'express';
import multer from 'multer';
import * as hrController from '../../controllers/hr.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.use(protect);

// --- SHIFT MASTER ROUTES ---
router.route('/shifts')
    .get(checkPermission('hr.shift_master.view'), hrController.getShifts)
    .post(checkPermission('hr.shift_master.manage'), hrController.createShift);

router.route('/shifts/:id')
    .patch(checkPermission('hr.shift_master.manage'), hrController.updateShift)
    .delete(checkPermission('hr.shift_master.manage'), hrController.deleteShift);

// --- EMPLOYEE MASTER ROUTES ---
router.route('/employees')
    .get(checkPermission('hr.employee_master.view'), hrController.getEmployees)
    .post(checkPermission('hr.employee_master.add'), hrController.createEmployee);

router.get('/employees/generate-code', checkPermission('hr.employee_master.add'), hrController.generateEmployeeCode);

router.route('/employees/:id')
    .get(checkPermission('hr.employee_master.view'), hrController.getEmployee)
    .patch(checkPermission('hr.employee_master.edit'), hrController.updateEmployee)
    .delete(checkPermission('hr.employee_master.delete'), hrController.deleteEmployee);

// --- HOLIDAY ROUTES ---
router.route('/holidays')
    .get(checkPermission('hr.hr_reports.view'), hrController.getHolidays)
    .post(checkPermission('hr.hr_dashboard.view'), hrController.createHoliday);

router.route('/holidays/:id')
    .patch(checkPermission('hr.hr_dashboard.view'), hrController.updateHoliday)
    .delete(checkPermission('hr.hr_dashboard.view'), hrController.deleteHoliday);

// --- ATTENDANCE ROUTES ---
router.route('/attendance')
    .get(checkPermission('hr.hr_reports.view'), hrController.getAttendances);

router.route('/attendance/import')
    .post(checkPermission('hr.hr_dashboard.view'), upload.single('file'), hrController.importAttendance);

export default router;
