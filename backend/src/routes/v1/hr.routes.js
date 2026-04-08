import express from 'express';
import multer from 'multer';
import * as hrController from '../../controllers/hr.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// --- PUBLIC ROUTES (No Auth Required) ---
router.get('/v7-lockdown', (req, res) => res.send({ status: 'LOCKEDDOWN_V7_RESTARTED_2026_04_08', port: process.env.PORT || 5000 }));
router.get('/attendance/template', hrController.downloadAttendanceTemplate);

router.use(protect);

// --- ATTENDANCE ROUTES ---
router.route('/attendance')
    .get(checkPermission('hr.hr_reports.view'), hrController.getAttendances);

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

// --- ATTENDANCE & REPORT ROUTES ---
router.route('/attendance')
    .get(checkPermission('hr.hr_reports.view'), hrController.getAttendances);

router.route('/attendance/import')
    .post(checkPermission('hr.hr_dashboard.view'), upload.single('file'), hrController.importAttendance);

router.delete('/attendance/bulk', checkPermission('hr.hr_dashboard.view'), hrController.bulkDeleteAttendance);


// --- HR SETTINGS ROUTES ---
router.route('/settings')
    .get(checkPermission('hr.hr_dashboard.view'), hrController.getHRSettings)
    .patch(checkPermission('hr.hr_dashboard.view'), hrController.updateHRSettings);

// --- SPECIFIC REPORT ROUTES ---
router.get('/reports/daily', checkPermission('hr.hr_reports.view'), hrController.getDailyAttendanceReport);
router.get('/reports/monthly-summary', checkPermission('hr.hr_reports.view'), hrController.getMonthlySummaryReport);
router.get('/reports/late-coming', checkPermission('hr.hr_reports.view'), hrController.getLateComingReport);
router.get('/reports/missing-punch', checkPermission('hr.hr_reports.view'), hrController.getMissingPunchReport);
router.get('/reports/salary-working', checkPermission('hr.hr_reports.view'), hrController.getSalaryWorkingReport);

export default router;
