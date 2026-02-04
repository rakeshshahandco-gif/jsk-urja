import express from 'express';
import reportController from '../../controllers/report.controller.js';

const router = express.Router();

router.get('/customers', reportController.getCustomerReport);
router.get('/options', reportController.getReportOptions);
router.get('/customers/export', reportController.exportCustomerReport);
router.get('/customers/export/excel', reportController.exportExcelReport);
router.get('/customers/export/pdf', reportController.exportPDFReport);

// Follow-up Tracker 
router.get('/followups', reportController.getFollowUpReport);
router.get('/followups/export/excel', reportController.exportFollowUpExcel);
router.get('/followups/export/pdf', reportController.exportFollowUpPDF);

// Reminder Report
router.get('/reminders', reportController.getReminderReport);
router.get('/reminders/export/excel', reportController.exportReminderExcel);
router.get('/reminders/export/pdf', reportController.exportReminderPDF);

// Open Reminders Report (All Open)
router.get('/open-reminders', reportController.getOpenRemindersReport);
router.get('/open-reminders/export/excel', reportController.exportOpenRemindersExcel);
router.get('/open-reminders/export/pdf', reportController.exportOpenRemindersPDF);

// Follow-up Dashboard (New)

router
    .route('/followup-dashboard')
    .get(reportController.getFollowupDashboardList);

router
    .route('/followup-dashboard/export')
    .get(reportController.exportFollowupDashboardList);

router
    .route('/followup-dashboard/:customerId')
    .get(reportController.getFollowupDashboardDetail);

router
    .route('/followup-dashboard/:customerId/export')
    .get(reportController.exportFollowupDashboardDetail);

// Follow-up Task Report (New)
router
    .route('/followup-task-report')
    .get(reportController.getFollowupTaskReportAll);

router
    .route('/followup-task-report/export')
    .get(reportController.exportFollowupTaskReport); // For ALL

router
    .route('/followup-task-report/:customerId')
    .get(reportController.getFollowupTaskReportSingle);

router
    .route('/followup-task-report/:customerId/export')
    .get(reportController.exportFollowupTaskReport); // For Single

export default router;
