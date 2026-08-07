import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import reportService from '../services/report.service.js';
import reminderService from '../services/reminder.service.js';
import gstr1Service from '../services/gstr1.service.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { GRN } from '../models/grn.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const getCustomerReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'city', 'state', 'interestedProduct', 'customerType', 'financialYear']);
    const options = pick(req.query, ['sortBy', 'sortOrder', 'page', 'limit']);

    const result = await reportService.queryCustomerReport(filters, options);
    res.send(new ApiResponse(200, result, 'Report data fetched successfully'));
});

const getReportOptions = catchAsync(async (req, res) => {
    const options = await reportService.getReportOptions(req.user);
    res.send(new ApiResponse(200, options, 'Report filter options fetched successfully'));
});

const exportCustomerReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'city', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);

    const csvContent = await reportService.exportReportToCSV(filters, options);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=customer_report_${new Date().toISOString().split('T')[0]}.csv`);
    res.status(200).send(csvContent);
});

const exportExcelReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'city', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);

    const excelBuffer = await reportService.generateExcelReport(filters, options);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Customer_Master_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.status(200).send(excelBuffer);
});

const exportPDFReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'status', 'city', 'state', 'interestedProduct', 'customerType']);
    const options = pick(req.query, ['sortBy', 'sortOrder']);

    const pdfBuffer = await reportService.generatePDFReport(filters, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=customers-report.pdf');
    res.send(pdfBuffer);
});

const getFollowUpReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo', 'financialYear']);
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

    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo', 'customerId', 'search', 'financialYear']);
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
    const filters = pick(req.query, ['type', 'priority', 'due', 'q', 'search', 'product']);
    filters.q = req.query.q || req.query.search || '';
    filters.product = req.query.product || '';
    const options = pick(req.query, ['page', 'limit', 'sortBy', 'sortOrder']);
    if (!options.limit) options.limit = 500;
    const result = await reportService.queryFollowupDashboardList(filters, options);
    res.send(result);
});

const getFollowupDashboardDetail = catchAsync(async (req, res) => {
    const { customerId } = req.params;
    const result = await reportService.queryCustomerTimeline(customerId);
    res.send(result);
});

const exportFollowupDashboardList = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'search', 'type', 'priority', 'due', 'product']);
    filters.q = req.query.q || req.query.search || '';
    filters.product = req.query.product || '';
    const format = req.query.format || 'excel';
    const buffer = await reportService.generateDashboardListExport(format, filters);

    if (format === 'pdf') {
        // May fall back to Excel buffer when puppeteer is unavailable
        const isExcelFallback =
            buffer &&
            !(Buffer.isBuffer(buffer) && buffer.slice(0, 4).toString() === '%PDF');
        if (isExcelFallback && Buffer.isBuffer(buffer) && buffer[0] === 0x50) {
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                'attachment; filename=followup-dashboard.xlsx'
            );
        } else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=followup-dashboard.pdf');
        }
    } else if (format === 'docx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=followup-dashboard.doc');
    } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=followup-dashboard.xlsx');
    }
    res.send(buffer);
});

const exportFollowupProductChats = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['q', 'search', 'product']);
    filters.q = req.query.q || req.query.search || '';
    filters.product = req.query.product || filters.q || '';
    if (!String(filters.product || '').trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a product (e.g. DALI) to export related chats');
    }
    const format = req.query.format || 'excel';
    const buffer = await reportService.generateProductChatExport(format, filters);
    const safeName = String(filters.product)
        .trim()
        .replace(/[^\w\-]+/g, '_')
        .slice(0, 40) || 'product';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=product-chats-${safeName}.xlsx`
    );
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

const getManageTasks = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['tab', 'priority', 'search', 'status', 'groupId', 'assigneeId', 'createdById', 'dateFrom', 'dateTo']);
    filters.user = req.user;
    const options = pick(req.query, ['page', 'limit']);
    const result = await reportService.queryManageTasks(filters, options);
    res.send(result);
});

const getTaskReminderReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['tab', 'priority', 'search', 'status', 'taskCategoryId', 'groupId', 'assigneeId', 'dateFrom', 'dateTo']);
    filters.user = req.user; // For role-based filtering
    const options = pick(req.query, ['page', 'limit']);

    const result = await reportService.queryTaskReminderReport(filters, options);
    res.send(result);
});

// ── Purchase Comparison Report ─────────────────────────────────────────
const getPurchaseComparisonReport = catchAsync(async (req, res) => {
    const { supplierId, dateFrom, dateTo, financialYear } = req.query;

    // Build PO query
    const poQuery = { status: { $ne: 'Cancelled' } };
    if (financialYear) poQuery.financialYear = financialYear;
    if (supplierId) poQuery.supplierId = supplierId;
    if (dateFrom || dateTo) {
        poQuery.poDate = {};
        if (dateFrom) poQuery.poDate.$gte = new Date(dateFrom);
        if (dateTo) poQuery.poDate.$lte = new Date(dateTo);
    }

    const pos = await PurchaseOrder.find(poQuery)
        .populate('supplierId', 'supplierName supplierCode')
        .sort({ poDate: -1 })
        .lean();

    const rows = [];
    let totalOrderedValue = 0, totalReceivedValue = 0, totalInvoicedValue = 0;

    for (const po of pos) {
        // Get all GRNs for this PO
        const grns = await GRN.find({ poId: po._id }).lean();
        // Get all invoices for this PO
        const invoices = await PurchaseInvoice.find({ poId: po._id, status: { $ne: 'Cancelled' } }).lean();

        for (const poItem of po.items) {
            // Sum received qty from GRNs
            let receivedQty = 0;
            for (const grn of grns) {
                const gi = grn.items.find(g => g.itemId.toString() === poItem.itemId.toString());
                if (gi) receivedQty += gi.receivedQty;
            }

            // Sum invoiced qty & get latest invoice rate
            let invoicedQty = 0;
            let invoiceRate = null;
            for (const inv of invoices) {
                const ii = inv.items.find(i => i.itemId.toString() === poItem.itemId.toString());
                if (ii) {
                    invoicedQty += ii.qty;
                    invoiceRate = ii.rate; // last invoice rate
                }
            }

            const pendingQty = Math.max(0, poItem.orderedQty - receivedQty);
            const rateDiff = invoiceRate !== null ? Number((invoiceRate - poItem.rate).toFixed(2)) : null;
            const orderedValue = Math.round(poItem.orderedQty * poItem.rate * 100) / 100;
            const receivedValue = Math.round(receivedQty * poItem.rate * 100) / 100;
            const invoicedValue = Math.round(invoicedQty * (invoiceRate || poItem.rate) * 100) / 100;

            totalOrderedValue += orderedValue;
            totalReceivedValue += receivedValue;
            totalInvoicedValue += invoicedValue;

            rows.push({
                poId: po._id,
                poNumber: po.poNumber,
                poDate: po.poDate,
                poStatus: po.status,
                supplier: po.supplierId?.supplierName || po.supplierName,
                supplierCode: po.supplierId?.supplierCode || '',
                itemName: poItem.itemName,
                itemCode: poItem.itemCode,
                uom: poItem.uom,
                orderedQty: poItem.orderedQty,
                receivedQty: Math.round(receivedQty * 100) / 100,
                invoicedQty: Math.round(invoicedQty * 100) / 100,
                pendingQty: Math.round(pendingQty * 100) / 100,
                poRate: poItem.rate,
                invoiceRate: invoiceRate,
                rateDiff,
                orderedValue,
                receivedValue,
                invoicedValue,
            });
        }
    }

    // Direct GRN rows (no PO)
    const grnQuery = { sourceType: 'Direct GRN' };
    if (financialYear) grnQuery.financialYear = financialYear;
    if (supplierId) grnQuery.supplierId = supplierId;
    if (dateFrom || dateTo) {
        grnQuery.grnDate = {};
        if (dateFrom) grnQuery.grnDate.$gte = new Date(dateFrom);
        if (dateTo) grnQuery.grnDate.$lte = new Date(dateTo);
    }
    const directGrns = await GRN.find(grnQuery)
        .populate('supplierId', 'supplierName supplierCode')
        .lean();

    for (const grn of directGrns) {
        const invoices = await PurchaseInvoice.find({ grnId: grn._id, status: { $ne: 'Cancelled' } }).lean();
        for (const gi of grn.items) {
            let invoicedQty = 0, invoiceRate = null;
            for (const inv of invoices) {
                const ii = inv.items.find(i => i.itemId.toString() === gi.itemId.toString());
                if (ii) { invoicedQty += ii.qty; invoiceRate = ii.rate; }
            }
            const receivedValue = Math.round(gi.receivedQty * gi.rate * 100) / 100;
            const invoicedValue = Math.round(invoicedQty * (invoiceRate || gi.rate) * 100) / 100;
            totalReceivedValue += receivedValue;
            totalInvoicedValue += invoicedValue;

            rows.push({
                poId: null,
                poNumber: '—',
                poDate: grn.grnDate,
                poStatus: 'Direct GRN',
                supplier: grn.supplierId?.supplierName || grn.supplierName,
                supplierCode: grn.supplierId?.supplierCode || '',
                itemName: gi.itemName,
                itemCode: gi.itemCode,
                uom: gi.uom,
                orderedQty: 0,
                receivedQty: gi.receivedQty,
                invoicedQty: Math.round(invoicedQty * 100) / 100,
                pendingQty: Math.max(0, gi.receivedQty - invoicedQty),
                poRate: gi.rate,
                invoiceRate,
                rateDiff: invoiceRate !== null ? Number((invoiceRate - gi.rate).toFixed(2)) : null,
                orderedValue: 0,
                receivedValue,
                invoicedValue,
            });
        }
    }

    res.json(new ApiResponse(200, {
        rows,
        summary: {
            totalRows: rows.length,
            totalOrderedValue: Math.round(totalOrderedValue * 100) / 100,
            totalReceivedValue: Math.round(totalReceivedValue * 100) / 100,
            totalInvoicedValue: Math.round(totalInvoicedValue * 100) / 100,
            totalPendingValue: Math.round((totalOrderedValue - totalReceivedValue) * 100) / 100,
        },
    }, 'Purchase comparison report'));
});

// ── GSTR-1 Compliance Export ─────────────────────────────────────────
const exportGSTR1Returns = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['dateFrom', 'dateTo', 'financialYear']);
    const excelBuffer = await gstr1Service.generateGSTR1Excel(filters);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=GSTR1_Returns_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.status(200).send(excelBuffer);
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
    exportFollowupProductChats,
    exportFollowupDashboardDetail,
    getFollowupTaskReportAll,
    getFollowupTaskReportSingle,
    exportFollowupTaskReport,
    getTaskReminderReport,
    getManageTasks,
    getPurchaseComparisonReport,
    exportGSTR1Returns,
};
