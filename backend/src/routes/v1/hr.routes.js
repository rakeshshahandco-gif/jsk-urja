import express from 'express';
import * as hrController from '../../controllers/hr.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

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

router.route('/employees/:id')
    .get(checkPermission('hr.employee_master.view'), hrController.getEmployee)
    .patch(checkPermission('hr.employee_master.edit'), hrController.updateEmployee)
    .delete(checkPermission('hr.employee_master.delete'), hrController.deleteEmployee);

export default router;
