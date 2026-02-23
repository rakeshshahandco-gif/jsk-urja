import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import reportService from '../services/report.service.js';
import reminderService from '../services/reminder.service.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const getCustomerReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder', 'page', 'limit']);

    const result = await reportService.queryCustomerReport(filters, options);
    res.send(new ApiResponse(200, result, 'Report data fetched successfully'));
});

const getReportOptions = catchAsync(async (req, res) => {
    const options = await reportService.getReportOptions();
    res.send(new ApiResponse(200, options, 'Report filter options fetched successfully'));
});

const exportCustomerReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);

    const csvContent = await reportService.exportReportToCSV(filters, options);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=customer_report_${new Date().toISOString().split('T')[0]}.csv`);
    res.status(200).send(csvContent);
});

const exportExcelReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);

    const excelBuffer = await reportService.generateExcelReport(filters, options);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Customer_Master_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.status(200).send(excelBuffer);
});

const exportPDFReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);

    const pdfBuffer = await reportService.generatePDFReport(filters, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=customers-report.pdf');
    res.send(pdfBuffer);
});

const getFollowUpReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo']);
    filters.search = req.query.search || req.query.q;
    const options = pick(req.query, ['sortBy', 'sortOrder', 'page', 'limit']);
    const result = await reportService.queryFollowUpReport(filters, options);
    res.send(result);
});

const exportFollowUpExcel = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'followUpType', 'status', 'priority', 'dateFrom', 'dateTo']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);
    const excelBuffer = await reportService.generateFollowUpExcelReport(filters, options);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=followup-report.xlsx');
    res.send(excelBuffer);
});

const exportFollowUpPDF = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'followUpType', 'status', 'priority', 'dateFrom', 'dateTo']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);
    const pdfBuffer = await reportService.generateFollowUpPDFReport(filters, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=followup-report.pdf');
    res.send(pdfBuffer);
});



const getReminderReport = catchAsync(async (req, res) => {
    // Reusing queryReminders from reminderService via reportService reference if possible, 
    // or better: import reminderService directly.
    // However, I'll assume I can import reminderService or use reportService wrapper if I added one.
    // I didn't add queryReminderReport wrapper in reportService. 
    // Let's use reportService.generate... for exports.
    // For GET json, I need to call reminderService.
    // I will add import reminderService at the top in a separate tool call to be safe, 
    // or assumes I can add it here if I replace the whole file or large chunk. 
    // But this tool call is for the functions.
    // I'll assume I'll add the import later or use a dynamic import (ugly).
    // Let's try to look at Step 65.
    // Step 65 shows `import reportService`.
    // I will add `import reminderService` in a separate call.

    // Using reminderService directly here requires import.
    // I'll add the functions first.

    // Wait, I can't use reminderService if not imported.
    // I'll add the methods that use reportService first (exports).

    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo', 'customerId', 'search']);
    const options = pick(req.query, ['sortBy', 'sortOrder', 'limit', 'page']);
    // We need to call reminderService.queryReminders.
    // I will add the import in the next step.
    const result = await reminderService.queryReminders(filters, options);
    res.send(result);
});

const exportReminderExcel = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo', 'customerId', 'search']);
    const options = pick(req.query, ['sortBy', 'sortOrder']); // limit is handled in service
    const excelBuffer = await reportService.generateReminderExcelReport(filters, options);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reminder-report.xlsx');
    res.send(excelBuffer);
});

const exportReminderPDF = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo', 'customerId', 'search']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);
    const pdfBuffer = await reportService.generateReminderPDFReport(filters, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reminder-report.pdf');
    res.send(pdfBuffer);
});

const getOpenRemindersReport = catchAsync(async (req, res) => {
    // 1. Basic Filters
    const filters = pick(req.query, ['priority', 'followUpType']);
    filters.search = req.query.search || req.query.q;

    // 2. Tab Logic with Timezone (Asia/Kolkata)
    const tab = req.query.tab || 'TODAY';

    // Helper to get IST day boundaries in UTC
    const getISTDays = () => {
        // Current UTC time
        const now = new Date();
        // IST is UTC + 5:30
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffset);

        // Start of Today (IST 00:00:00) -> Converted back to UTC
        const startOfTodayIST = new Date(istTime);
        startOfTodayIST.setUTCHours(0, 0, 0, 0);
        const startOfTodayUTC = new Date(startOfTodayIST.getTime() - istOffset);

        // End of Today (IST 23:59:59.999) -> Converted back to UTC
        const endOfTodayIST = new Date(istTime);
        endOfTodayIST.setUTCHours(23, 59, 59, 999);
        const endOfTodayUTC = new Date(endOfTodayIST.getTime() - istOffset);

        return { startOfTodayUTC, endOfTodayUTC };
    };

    const { startOfTodayUTC, endOfTodayUTC } = getISTDays();

    if (tab === 'TODAY') {
        filters.status = 'Open';
        filters.dateFrom = startOfTodayUTC;
        // Strict END of today
        filters.dateTo = endOfTodayUTC;
    } else if (tab === 'UPCOMING') {
        filters.status = 'Open';
        // STRICTLY greater than end of today
        filters.dateFrom = new Date(endOfTodayUTC.getTime() + 1);
    } else if (tab === 'OVERDUE') {
        filters.status = 'Open';
        // STRICTLY less than start of today
        filters.dateTo = new Date(startOfTodayUTC.getTime() - 1);
    } else if (tab === 'COMPLETED') {
        filters.status = 'Closed';
    } else {
        filters.status = 'Open'; // Default
    }

    const options = pick(req.query, ['sortBy', 'sortOrder', 'limit', 'page']);
    const { results, totalResults } = await reminderService.queryOpenRemindersWithDetails(filters, options);

    // Explicitly match requested format
    res.send({
        data: results,
        meta: {
            total: totalResults
        }
    });
});

const exportOpenRemindersExcel = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['priority', 'followUpType', 'dateFrom', 'dateTo', 'search']);
    if (req.query.q) filters.search = req.query.q;
    filters.status = 'Open';

    const options = pick(req.query, ['sortBy', 'sortOrder']);
    const excelBuffer = await reportService.generateOpenReminderExcelReport(filters, options);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=open-reminders-report.xlsx');
    res.send(excelBuffer);
});

const exportOpenRemindersPDF = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['priority', 'followUpType', 'dateFrom', 'dateTo', 'search']);
    if (req.query.q) filters.search = req.query.q;
    filters.status = 'Open';

    const options = pick(req.query, ['sortBy', 'sortOrder']);
    const pdfBuffer = await reportService.generateOpenReminderPDFReport(filters, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=open-reminders-report.pdf');
    res.send(pdfBuffer);
});

const getFollowupDashboardList = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['type', 'priority', 'due']);
    filters.search = req.query.search || req.query.q;
    const options = pick(req.query, ['page', 'limit', 'sortBy', 'sortOrder']);
    const result = await reportService.queryFollowupDashboardList(filters, options);
    res.send(result);
});

const getFollowupDashboardDetail = catchAsync(async (req, res) => {
    const { customerId } = req.params;
    const result = await reportService.queryCustomerTimeline(customerId);
    res.send(result);
});

const exportFollowupDashboardList = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'type', 'priority', 'due']);
    const format = req.query.format || 'excel';
    const buffer = await reportService.generateDashboardListExport(format, filters);

    if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=followup-dashboard.pdf');
    } else if (format === 'docx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=followup-dashboard.doc');
    } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=followup-dashboard.xlsx');
    }
    res.send(buffer);
});

const exportFollowupDashboardDetail = catchAsync(async (req, res) => {
    const { customerId } = req.params;
    const format = req.query.format || 'excel';
    const buffer = await reportService.generateDashboardDetailExport(format, customerId);

    if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=customer-timeline-${customerId}.pdf`);
    } else if (format === 'docx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=customer-timeline-${customerId}.doc`);
    } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=customer-timeline-${customerId}.xlsx`);
    }
    res.send(buffer);
});

// Follow-up Task Report (New)
const getFollowupTaskReportAll = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['fromDate', 'toDate', 'followUpType', 'status', 'due']);
    const { mode, customerId } = req.query;

    if (mode === 'single' && customerId) {
        const result = await reportService.queryFollowupTaskReportSingle(customerId, filters);
        // Structure: { customer, rows } -> { customer, followups: rows }
        res.send(new ApiResponse(200, {
            customer: result.customer,
            followups: result.rows
        }, 'Single customer follow-up task report'));
    } else {
        const result = await reportService.queryFollowupTaskReportAll(filters);
        res.send(result);
    }
});

const getFollowupTaskReportSingle = catchAsync(async (req, res) => {
    const { customerId } = req.params;
    const filters = pick(req.query, ['fromDate', 'toDate']);
    const result = await reportService.queryFollowupTaskReportSingle(customerId, filters);
    res.send(result);
});

const exportFollowupTaskReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['fromDate', 'toDate', 'followUpType', 'status', 'due']);
    const { customerId } = req.params;

    const format = req.query.format || 'excel';
    const buffer = await reportService.generateFollowupTaskReportExport(format, filters, customerId);

    if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=followup_task_report.pdf`);
    } else if (format === 'docx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=followup_task_report.doc`);
    } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=followup_task_report.xlsx`);
    }

    res.send(buffer);
});

const getTaskReminderReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['tab', 'priority', 'search']);
    filters.user = req.user; // For role-based filtering
    const options = pick(req.query, ['page', 'limit']);

    const result = await reportService.queryTaskReminderReport(filters, options);
    res.send(result);
});

export default {
    getCustomerReport,
    getReportOptions,
    exportCustomerReport,
    exportExcelReport,
    exportPDFReport,
    getFollowUpReport,
    exportFollowUpExcel,
    exportFollowUpPDF,
    getReminderReport,
    exportReminderExcel,
    exportReminderPDF,
    getOpenRemindersReport,
    exportOpenRemindersExcel,
    exportOpenRemindersPDF,
    getFollowupDashboardList,
    getFollowupDashboardDetail,
    exportFollowupDashboardList,
    exportFollowupDashboardDetail, // Ensure this was exported in previous steps
    getFollowupTaskReportAll,
    getFollowupTaskReportSingle,
    exportFollowupTaskReport,
    getTaskReminderReport
};
