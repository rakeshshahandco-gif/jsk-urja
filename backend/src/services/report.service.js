import Customer from '../models/customer.model.js';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import Reminder from '../models/reminder.model.js';
import Conversation from '../models/conversation.model.js';
import Followup from '../models/followup.model.js';
import reminderService from './reminder.service.js';
import mongoose from 'mongoose';
import { Item } from '../models/item.model.js';
import { Task } from '../models/task.model.js';
import { TaskGroup } from '../models/taskGroup.model.js';
import { TaskCategory } from '../models/taskCategory.model.js';
import { User } from '../models/user.model.js';
import { GroupMember } from '../models/groupMember.model.js';

/**
 * Build dynamic MongoDB query for customer report
 * @param {Object} filters
 * @returns {Object}
 */
const buildReportQuery = (filters) => {
    const query = { isDeleted: false };

    // Search filter (customerName, company, contactPersons, mobiles, email, brand)
    if (filters.q) {
        const searchRegex = new RegExp(filters.q, 'i');
        query.$or = [
            { customerName: searchRegex },
            { company: searchRegex },
            { companyBrand: searchRegex },
            { 'contactPersons.name': searchRegex },
            { 'contactPersons.mobile': searchRegex },
            { 'contactPersons.mobile2': searchRegex },
            { 'contactPersons.mobile3': searchRegex },
            { 'contactPersons.mobile4': searchRegex },
            { 'contactPersons.mobile5': searchRegex },
            { 'contactPersons.email': searchRegex },
            { companyEmail: searchRegex }
        ];
    }

    // Status filter
    if (filters.customerType) {
        query.customerType = filters.customerType;
    }

    if (filters.status) {
        query.status = filters.status;
    }


    // State filter — exact case-insensitive match
    if (filters.state) {
        query.state = { $regex: `^${filters.state}$`, $options: 'i' };
    }

    // City filter — exact case-insensitive match
    if (filters.city) {
        query.city = { $regex: `^${filters.city}$`, $options: 'i' };
    }

    // Product Interest filter
    if (filters.interestedProduct) {
        query.interestedProducts = filters.interestedProduct;
    }

    return query;
};

/**
 * Query for customer master report
 * @param {Object} filters
 * @param {Object} options - sortBy, sortOrder, page, limit
 * @returns {Promise<Object>}
 */
const queryCustomerReport = async (filters, options) => {
    const query = buildReportQuery(filters);

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 25;
    const skip = (page - 1) * limit;

    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'createdAt';
    const sort = { [sortBy]: sortOrder };

    const customers = await Customer.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

    const total = await Customer.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    return {
        data: customers,
        meta: {
            page,
            limit,
            total,
            totalPages
        }
    };
};

/**
 * Fetch unique options for report filters
 * @returns {Promise<Object>}
 */
const getReportOptions = async (user) => {
    const { GroupMember } = await import('../models/groupMember.model.js');

    // Build task group filter based on user role
    let taskGroupFilter = {};
    if (user && user.role !== 'admin') {
        const userId = user._id || user.id;

        // Get groupIds where this user is assigned to tasks or created tasks
        const groupIdsFromTasks = await Task.distinct('groupId', {
            $or: [
                { assigneeIds: userId },
                { createdBy: userId }
            ]
        });

        taskGroupFilter = {
            $or: [
                { createdBy: userId },
                { userIds: userId },
                { _id: { $in: groupIdsFromTasks.filter(Boolean) } }
            ]
        };
    }

    const [statuses, states, cities, products, types, taskCategories, taskGroups, users] = await Promise.all([
        Customer.distinct('status'),
        Customer.distinct('state'),
        Customer.distinct('city'),
        Customer.distinct('interestedProducts'),
        Customer.distinct('customerType'),
        TaskCategory.find({}).select('name').sort('name'),
        TaskGroup.find(taskGroupFilter).select('name').sort('name'),
        User.find({ isActive: true }).select('name').sort('name')
    ]);

    return {
        statuses: statuses.filter(Boolean),
        states: states.filter(Boolean),
        cities: cities.filter(Boolean),
        products: products.filter(Boolean),
        types: types.filter(Boolean),
        taskCategories,
        taskGroups,
        users
    };
};

/**
 * Export customer report to CSV string
 * @param {Object} filters
 * @param {Object} options
 * @returns {Promise<string>}
 */
const exportReportToCSV = async (filters, options) => {
    const query = buildReportQuery(filters);

    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'createdAt';
    const sort = { [sortBy]: sortOrder };

    // Export with a safe limit
    const customers = await Customer.find(query).sort(sort).limit(10000);

    const headers = [
        'Customer Name', 'Company Name', 'Primary Contact',
        'Mobile 1', 'Mobile 2', 'Mobile 3', 'Mobile 4', 'Mobile 5',
        'Email',
        'Address',
        'City',
        'State',
        'Pincode',
        'Status',
        'Business Type',
        'Interested Products'
    ];

    const rows = customers.map(c => {
        const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};

        return [
            c.customerName || 'Unknown Customer',
            c.company || '-',
            primaryContact.name || '-',
            primaryContact.mobile || '-',
            primaryContact.mobile2 || '-',
            primaryContact.mobile3 || '-',
            primaryContact.mobile4 || '-',
            primaryContact.mobile5 || '-',
            primaryContact.email || c.companyEmail || '-',
            (c.address || '').replace(/,/g, ' '),
            c.city || '-',
            c.state || '-',
            c.pincode || '-',
            c.status || '-',
            c.customerType || '-',
            (c.interestedProducts || []).join('; ') || '-'
        ];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
};

/**
 * Generate Excel report using exceljs
 * @param {Object} filters 
 * @param {Object} options 
 * @returns {Promise<Buffer>}
 */
const generateExcelReport = async (filters, options) => {
    const query = buildReportQuery(filters);
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'createdAt';
    const sort = { [sortBy]: sortOrder };

    const customers = await Customer.find(query).sort(sort).limit(10000);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Master Report');

    // Define columns
    worksheet.columns = [
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Primary Contact', key: 'primaryContact', width: 20 },
        { header: 'Mobiles', key: 'mobiles', width: 30 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'City', key: 'city', width: 15 },
        { header: 'State', key: 'state', width: 15 },
        { header: 'Pincode', key: 'pincode', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Business Type', key: 'customerType', width: 15 },
        { header: 'Product Interest', key: 'interestedProducts', width: 30 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    // Add rows
    customers.forEach(c => {
        const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};
        const mobiles = [
            primaryContact.mobile,
            primaryContact.mobile2,
            primaryContact.mobile3,
            primaryContact.mobile4,
            primaryContact.mobile5
        ].filter(Boolean).join(', ');

        worksheet.addRow({
            customerName: c.customerName || 'Unknown Customer',
            company: c.company || '-',
            primaryContact: primaryContact.name || '-',
            mobiles: mobiles || '-',
            email: primaryContact.email || c.companyEmail || '-',
            address: c.address || '-',
            city: c.city || '-',
            state: c.state || '-',
            pincode: c.pincode || '-',
            status: c.status || '-',
            customerType: c.customerType || '-',
            interestedProducts: (c.interestedProducts || []).join(', ') || '-'
        });
    });

    return await workbook.xlsx.writeBuffer();
};

/**
 * Generate PDF report using puppeteer
 * @param {Object} filters 
 * @param {Object} options 
 * @returns {Promise<Buffer>}
 */
const generatePDFReport = async (filters, options) => {
    const query = buildReportQuery(filters);
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'createdAt';
    const sort = { [sortBy]: sortOrder };

    const customers = await Customer.find(query).sort(sort).limit(1000);

    const filterSummary = [];
    if (filters.q) filterSummary.push(`Search: ${filters.q}`);
    if (filters.status) filterSummary.push(`Status: ${filters.status}`);
    if (filters.state) filterSummary.push(`State: ${filters.state}`);
    if (filters.interestedProduct) filterSummary.push(`Product: ${filters.interestedProduct}`);
    if (filters.customerType) filterSummary.push(`Business Type: ${filters.customerType}`);

    const summaryText = filterSummary.length > 0 ? filterSummary.join(' | ') : 'All Customers';

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
                h1 { color: #1f2937; margin-bottom: 5px; }
                .summary { margin-bottom: 20px; font-size: 12px; color: #666; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th { background-color: #f3f4f6; color: #374151; text-align: left; padding: 8px; border: 1px solid #e5e7eb; }
                td { padding: 8px; border: 1px solid #e5e7eb; word-break: break-word; }
                .footer { margin-top: 20px; font-size: 9px; text-align: center; color: #999; }
            </style>
        </head>
        <body>
            <h1>Customer Master Report</h1>
            <div class="summary">
                <p><strong>Filters:</strong> ${summaryText}</p>
                <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Total Records:</strong> ${customers.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Mobile</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Business Type</th>
                        <th>Interested Products</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.map(c => {
        const primary = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};
        return `
                            <tr>
                                <td>${c.customerName || 'Unknown Customer'}</td>
                                <td>${c.company || '-'}</td>
                                <td>${primary.mobile || '-'}</td>
                                <td>${primary.email || c.companyEmail || '-'}</td>
                                <td>${c.status || '-'}</td>
                                <td>${c.customerType || '-'}</td>
                                <td>${(c.interestedProducts || []).join(', ') || '-'}</td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
            <div class="footer">
                CRM Application - Page 1 of 1
            </div>
        </body>
        </html>
    `;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } });
    await browser.close();
    return pdfBuffer;
};

/**
 * Follow-up Tracker Report
 */

const buildFollowUpQuery = (filters) => {
    const query = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filters.status) {
        if (filters.status === 'Pending') {
            query.isClosed = false;
            query.reminderDate = { $gte: today };
        } else if (filters.status === 'Overdue') {
            query.isClosed = false;
            query.reminderDate = { $lt: today };
        } else if (filters.status === 'Closed') {
            query.isClosed = true;
        } else if (filters.status === 'All') {
            // No status filter
        }
    } else {
        // Default to Open if no status specified
        query.isClosed = { $ne: true };
    }

    if (filters.followUpType) query.followUpType = filters.followUpType;
    if (filters.priority) query.priority = filters.priority;

    if (filters.dateFrom || filters.dateTo) {
        query.reminderDate = query.reminderDate || {};
        if (filters.dateFrom) query.reminderDate.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.reminderDate.$lte = new Date(filters.dateTo);
    }

    return query;
};

const queryFollowUpReport = async (filters, options) => {
    const query = buildFollowUpQuery(filters);

    const pipeline = [
        { $match: query },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
        { $unwind: '$customer' },
        { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creator' } },
        { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'conversations', localField: 'conversationId', foreignField: '_id', as: 'conversation' } },
        { $unwind: { path: '$conversation', preserveNullAndEmptyArrays: true } }
    ];

    if (filters.q) {
        const qRegex = new RegExp(filters.q, 'i');
        pipeline.push({
            $match: {
                $or: [
                    { 'customer.customerName': qRegex },
                    { 'customer.company': qRegex },
                    { 'customer.contactPersons.mobile': qRegex },
                    { taskNote: qRegex },
                    { 'conversation.discussionDetails': qRegex }
                ]
            }
        });
    }


    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'reminderDate';
    pipeline.push({ $sort: { [sortBy]: sortOrder } });

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 25;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const totalResultsPipeline = [...pipeline, { $count: 'total' }];
    const totalResultsResult = await Reminder.aggregate(totalResultsPipeline);
    const totalResults = totalResultsResult[0]?.total || 0;

    pipeline.push({ $skip: skip }, { $limit: limit });
    const results = await Reminder.aggregate(pipeline);

    return { results, page, limit, totalPages: Math.ceil(totalResults / limit), totalResults };
};

const exportFollowUpToCSV = async (filters, options) => {
    const reportData = await queryFollowUpReport(filters, { ...options, limit: 10000, page: 1 });
    const reminders = reportData.results;
    const headers = ['Customer Name', 'Company Name', 'Follow-up Date', 'Follow-up Time', 'Follow-up Type', 'Priority', 'Conversation Summary', 'Outcome', 'Reminder Enabled', 'Reminder Status', 'Created Date'];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const rows = reminders.map(r => {
        let status = r.isClosed ? 'Closed' : (new Date(r.reminderDate) < today ? 'Overdue' : 'Pending');
        return [
            r.customer?.customerName || 'Unknown Customer',
            r.customer?.company || '-',
            new Date(r.reminderDate).toLocaleDateString(),
            r.reminderTime || '-',
            r.followUpType,
            r.priority,
            r.conversation?.discussionDetails || r.taskNote || '-',
            r.conversation?.outcome || '-',
            r.reminderEnabled ? 'Yes' : 'No',
            status,
            new Date(r.createdAt).toLocaleDateString()
        ];
    });

    return [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
};

const generateFollowUpExcelReport = async (filters, options) => {
    const reportData = await queryFollowUpReport(filters, { ...options, limit: 10000, page: 1 });
    const reminders = reportData.results;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Follow-up Tracker');

    worksheet.columns = [
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Time', key: 'time', width: 10 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Conversation Summary', key: 'summary', width: 40 },
        { header: 'Outcome', key: 'outcome', width: 25 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Created', key: 'created', width: 15 }
    ];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    reminders.forEach(r => {
        let status = r.isClosed ? 'Closed' : (new Date(r.reminderDate) < today ? 'Overdue' : 'Pending');
        worksheet.addRow({
            customerName: r.customer?.customerName || 'Unknown Customer',
            company: r.customer?.company || '-',
            date: new Date(r.reminderDate).toLocaleDateString(),
            time: r.reminderTime || '-',
            type: r.followUpType,
            priority: r.priority,
            summary: r.conversation?.discussionDetails || r.taskNote || '-',
            outcome: r.conversation?.outcome || '-',
            status: status,
            created: new Date(r.createdAt).toLocaleDateString()
        });
    });

    return await workbook.xlsx.writeBuffer();
};

const generateFollowUpPDFReport = async (filters, options) => {
    const reportData = await queryFollowUpReport(filters, { ...options, limit: 10000, page: 1 });
    const reminders = reportData.results;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const htmlContent = `
        <html><head><style>body { font-family: Arial; font-size: 10px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 6px; } th { background: #f2f2f2; }</style></head>
        <body>
            <h1>Follow-up Tracker Report</h1>
            <table><thead><tr><th>Customer</th><th>Company</th><th>Date</th><th>Type</th><th>Priority</th><th>Summary</th><th>Status</th></tr></thead>
            <tbody>${reminders.map(r => `<tr><td>${r.customer?.customerName || 'Unknown Customer'}</td><td>${r.customer?.company || '-'}</td><td>${new Date(r.reminderDate).toLocaleDateString()}</td><td>${r.followUpType}</td><td>${r.priority}</td><td>${r.conversation?.discussionDetails || r.taskNote || '-'}</td><td>${r.isClosed ? 'Closed' : (new Date(r.reminderDate) < today ? 'Overdue' : 'Pending')}</td></tr>`).join('')}</tbody></table>
        </body></html>`;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true });
    await browser.close();
    return pdfBuffer;
};


/**
 * Generate Reminder Excel Report
 */
const generateReminderExcelReport = async (filters, options) => {
    options.limit = 'all'; // Fetch all for export
    const { results } = await reminderService.queryReminders(filters, options);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reminders');

    worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Time', key: 'time', width: 10 },
        { header: 'Customer', key: 'customer', width: 25 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Note', key: 'note', width: 30 },
        { header: 'Status', key: 'status', width: 10 },
    ];

    results.forEach((reminder) => {
        const customer = reminder.customerId || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rDate = new Date(reminder.reminderDate);
        let status = 'Pending';
        if (reminder.isClosed) status = 'Closed';
        else if (rDate < today) status = 'Overdue';

        worksheet.addRow({
            date: rDate.toLocaleDateString(),
            time: reminder.reminderTime,
            customer: customer.customerName || 'Unknown',
            company: customer.company || '',
            mobile: customer.mobile1 || '',
            type: reminder.followUpType,
            priority: reminder.priority,
            note: reminder.taskNote || '',
            status: status,
        });
    });

    return await workbook.xlsx.writeBuffer();
};

/**
 * Generate Reminder PDF Report
 */
const generateReminderPDFReport = async (filters, options) => {
    options.limit = 'all';
    const { results } = await reminderService.queryReminders(filters, options);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const htmlContent = `
        <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    h1 { text-align: center; }
                </style>
            </head>
            <body>
                <h1>Reminder Report</h1>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Customer</th>
                            <th>Mobile</th>
                            <th>Type</th>
                            <th>Priority</th>
                            <th>Note</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => {
        const customer = r.customerId || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rDate = new Date(r.reminderDate);
        let status = 'Pending';
        if (r.isClosed) status = 'Closed';
        else if (rDate < today) status = 'Overdue';

        return `
                                <tr>
                                    <td>${rDate.toLocaleDateString()}</td>
                                    <td>${r.reminderTime}</td>
                                    <td>${customer.customerName || 'Unknown'}</td>
                                    <td>${customer.mobile1 || ''}</td>
                                    <td>${r.followUpType}</td>
                                    <td>${r.priority}</td>
                                    <td>${r.taskNote || ''}</td>
                                    <td>${status}</td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </body>
        </html>
    `;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });

    await browser.close();
    return pdfBuffer;
};

/**
 * Generate Open Reminder Excel Report
 */
const generateOpenReminderExcelReport = async (filters, options) => {
    filters.status = 'Open'; // Enforce Open status
    options.limit = 'all';
    const { results } = await reminderService.queryReminders(filters, options);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Open Reminders');

    worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Time', key: 'time', width: 10 },
        { header: 'Customer', key: 'customer', width: 25 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Note', key: 'note', width: 30 },
        { header: 'Status', key: 'status', width: 10 },
    ];

    results.forEach((reminder) => {
        const customer = reminder.customerId || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rDate = new Date(reminder.reminderDate);
        // Status is always Open, but strictly Pending or Overdue
        let status = 'Pending';
        if (rDate < today) status = 'Overdue';

        worksheet.addRow({
            date: rDate.toLocaleDateString(),
            time: reminder.reminderTime,
            customer: customer.customerName || 'Unknown',
            company: customer.company || '',
            mobile: customer.mobile1 || '',
            type: reminder.followUpType,
            priority: reminder.priority,
            note: reminder.taskNote || '',
            status: status,
        });
    });

    return await workbook.xlsx.writeBuffer();
};

/**
 * Generate Open Reminder PDF Report
 */
const generateOpenReminderPDFReport = async (filters, options) => {
    filters.status = 'Open';
    options.limit = 'all';
    const { results } = await reminderService.queryReminders(filters, options);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const htmlContent = `
        <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    h1 { text-align: center; }
                </style>
            </head>
            <body>
                <h1>Open Reminders Report</h1>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Customer</th>
                            <th>Mobile</th>
                            <th>Type</th>
                            <th>Priority</th>
                            <th>Note</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => {
        const customer = r.customerId || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rDate = new Date(r.reminderDate);
        let status = 'Pending';
        if (rDate < today) status = 'Overdue';

        return `
                                <tr>
                                    <td>${rDate.toLocaleDateString()}</td>
                                    <td>${r.reminderTime}</td>
                                    <td>${customer.customerName || 'Unknown'}</td>
                                    <td>${customer.mobile1 || ''}</td>
                                    <td>${r.followUpType}</td>
                                    <td>${r.priority}</td>
                                    <td>${r.taskNote || ''}</td>
                                    <td>${status}</td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </body>
        </html>
    `;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });

    await browser.close();
    return pdfBuffer;
};



// --- Follow-up Dashboard Services ---

const queryFollowupDashboardList = async (filters, options) => {
    const query = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = String(filters.due || 'ALL').toUpperCase();

    // ALL = open + closed; ALL_OPEN / default open buckets; CLOSED = closed only
    if (due === 'CLOSED') {
        query.isClosed = true;
    } else if (due === 'ALL') {
        // no isClosed filter — every follow-up / reminder
    } else {
        query.isClosed = { $ne: true };
        if (due === 'TODAY') {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            query.reminderDate = { $gte: today, $lt: tomorrow };
        } else if (due === 'UPCOMING') {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            query.reminderDate = { $gte: tomorrow };
        } else if (due === 'OVERDUE') {
            query.reminderDate = { $lt: today };
        }
        // ALL_OPEN / OPEN / empty → all open (no date constraint)
    }

    if (filters.type) query.followUpType = filters.type;
    if (filters.priority) {
        // UI sends High/Medium/Low; DB may store lowercase
        const p = String(filters.priority);
        query.priority = { $in: [p, p.toLowerCase(), p.toUpperCase()] };
    }

    const searchText = String(filters.q || filters.search || '').trim();
    const productText = String(filters.product || '').trim();

    // Product-wise: find customers with matching conversation products / notes / discussion
    let productCustomerIds = null;
    const productQuery = productText || searchText;
    if (productText || searchText) {
        const productRegex = new RegExp(productQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (productText) {
            productCustomerIds = await Conversation.distinct('customerId', {
                $or: [
                    { interestedProducts: productRegex },
                    { productNotes: productRegex },
                    { discussionDetails: productRegex },
                    { outcome: productRegex },
                ],
            });
        }
    }

    const pipeline = [
        { $match: query },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
        { $unwind: '$customer' },
        { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creator' } },
        { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
        { $sort: { reminderDate: due === 'CLOSED' || due === 'ALL' ? -1 : 1 } },
    ];

    if (searchText || productText) {
        const qRegex = new RegExp((searchText || productText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const orClauses = [
            { 'customer.customerName': qRegex },
            { 'customer.company': qRegex },
            { 'customer.companyBrand': qRegex },
            { 'customer.contactPersons.mobile': qRegex },
            { taskNote: qRegex },
        ];

        // When dedicated product filter set, restrict to product-matched customers
        if (productText && Array.isArray(productCustomerIds)) {
            pipeline.push({
                $match: {
                    customerId: { $in: productCustomerIds },
                },
            });
        } else if (searchText) {
            // Unified search: also match customers who discussed this product
            const convCustomerIds = await Conversation.distinct('customerId', {
                $or: [
                    { interestedProducts: qRegex },
                    { productNotes: qRegex },
                    { discussionDetails: qRegex },
                    { outcome: qRegex },
                ],
            });
            if (convCustomerIds.length) {
                orClauses.push({ customerId: { $in: convCustomerIds } });
            }
            pipeline.push({ $match: { $or: orClauses } });
        }
    }

    const limit =
        options.limit === 'all' || options.limit === -1
            ? null
            : options.limit && parseInt(options.limit, 10) > 0
              ? parseInt(options.limit, 10)
              : 500;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = limit ? (page - 1) * limit : 0;

    const totalPipeline = [...pipeline, { $count: 'total' }];
    const totalRes = await Reminder.aggregate(totalPipeline);
    const total = totalRes[0]?.total || 0;

    if (limit != null) {
        pipeline.push({ $skip: skip }, { $limit: limit });
    }

    const results = await Reminder.aggregate(pipeline);

    return {
        data: results.map((r) => ({
            ...r,
            customerId: r.customerId?._id || r.customerId,
            customerName: r.customer.customerName,
            companyName: r.customer.company,
            mobiles: r.customer.contactPersons?.map((c) => c.mobile).filter(Boolean) || [],
            primaryContact: r.customer.contactPersons?.find((c) => c.isPrimary) || r.customer.contactPersons?.[0],
            isClosed: !!r.isClosed,
        })),
        meta: { total, page, limit: limit ?? total },
    };
};

const queryCustomerTimeline = async (customerId) => {
    // 1. Fetch Customer
    const customer = await Customer.findById(customerId).lean();
    if (!customer) throw new Error('Customer not found');

    // 2. Fetch Open Followups
    const openFollowups = await Reminder.find({ customerId, isClosed: false })
        .populate('createdBy', 'name email')
        .sort({ reminderDate: 1 }).lean();

    // 3. Fetch Full Conversation History
    const conversations = await Conversation.find({ customerId }).sort({ conversationDate: -1, createdAt: -1 }).lean();

    return {
        customer,
        openFollowups,
        conversations
    };
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Customers who ever mentioned the product, then ALL of their conversations
 * (not only the product-matching chat — so Excel has full history).
 */
const findProductRelatedConversations = async (productText) => {
    const product = String(productText || '').trim();
    if (!product) return [];
    const productRegex = new RegExp(escapeRegex(product), 'i');
    const matchedCustomerIds = await Conversation.distinct('customerId', {
        $or: [
            { interestedProducts: productRegex },
            { productNotes: productRegex },
            { discussionDetails: productRegex },
            { outcome: productRegex },
        ],
    });
    if (!matchedCustomerIds.length) return [];

    return Conversation.find({ customerId: { $in: matchedCustomerIds } })
        .populate('customerId', 'customerName company companyBrand contactPersons')
        .sort({ conversationDate: -1, createdAt: -1 })
        .lean();
};

const primaryMobileFromCustomer = (cust = {}) => {
    const persons = cust.contactPersons || [];
    const primary = persons.find((p) => p.isPrimary) || persons[0] || {};
    return primary.mobile || primary.mobile2 || '';
};

const allMobilesFromCustomer = (cust = {}) => {
    const persons = cust.contactPersons || [];
    const nums = persons.flatMap((p) => [p?.mobile, p?.mobile2, p?.mobile3, p?.mobile4, p?.mobile5].filter(Boolean));
    return [...new Set(nums)].join(', ');
};

const formatChatDate = (value) =>
    value ? new Date(value).toLocaleDateString('en-IN') : '';

/** One Excel row per customer; each chat as its own paragraph (readable, wrap text). */
const formatChatParagraph = (c) => {
    const date = formatChatDate(c.conversationDate) || '-';
    const mode = (c.mode || '').trim();
    const disc = (c.discussionDetails || '').trim();
    const out = (c.outcome || '').trim();
    const notes = (c.productNotes || '').trim();
    const lines = [`[${date}]${mode ? ` ${mode}` : ''}`];
    if (disc) lines.push(disc);
    if (out) lines.push(`Outcome: ${out}`);
    if (notes) lines.push(`Notes: ${notes}`);
    if (!disc && !out && !notes) lines.push('(no discussion text)');
    return lines.join('\n');
};

const buildProductChatsByCustomerWorksheet = (workbook, chats, productLabel) => {
    const sheet = workbook.addWorksheet(
        productLabel ? `By Customer-${String(productLabel).slice(0, 18)}` : 'Chats By Customer'
    );
    sheet.columns = [
        { header: 'Company', key: 'company', width: 28 },
        { header: 'Customer', key: 'customer', width: 22 },
        { header: 'Mobile', key: 'mobile', width: 18 },
        { header: 'Chat Count', key: 'chatCount', width: 12 },
        { header: 'Chat History (one paragraph per chat)', key: 'fullHistory', width: 80 },
        { header: 'Products Mentioned', key: 'products', width: 28 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };

    const byCustomer = new Map();
    chats.forEach((c) => {
        const cust = c.customerId || {};
        const id = String(cust._id || c.customerId || '');
        if (!id) return;
        if (!byCustomer.has(id)) {
            byCustomer.set(id, { cust, chats: [] });
        }
        byCustomer.get(id).chats.push(c);
    });

    for (const { cust, chats: rows } of byCustomer.values()) {
        // Chronological for reading (oldest → newest)
        const ordered = [...rows].sort(
            (a, b) => new Date(a.conversationDate || 0) - new Date(b.conversationDate || 0)
        );
        // Blank line between chats so each finishes before the next paragraph
        const fullHistory = ordered.map(formatChatParagraph).join('\n\n');
        const products = [
            ...new Set(ordered.flatMap((c) => (Array.isArray(c.interestedProducts) ? c.interestedProducts : []))),
        ];

        const row = sheet.addRow({
            company: cust.company || cust.companyBrand || '',
            customer: cust.customerName || '',
            mobile: primaryMobileFromCustomer(cust) || allMobilesFromCustomer(cust),
            chatCount: ordered.length,
            fullHistory,
            products: products.join(', '),
        });
        row.alignment = { vertical: 'top', wrapText: true };
        // ~18px per text line; cap so Excel stays usable
        const lineCount = fullHistory.split('\n').length;
        row.height = Math.min(20 + lineCount * 15, 420);
    }
    return sheet;
};

/** One row per conversation (all chats of product-matched customers). */
const buildProductChatsWorksheet = (workbook, chats, productLabel) => {
    buildProductChatsByCustomerWorksheet(workbook, chats, productLabel);

    const sheet = workbook.addWorksheet(
        productLabel ? `Chat Rows-${String(productLabel).slice(0, 18)}` : 'Chat Detail Rows'
    );
    sheet.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Company', key: 'company', width: 28 },
        { header: 'Customer', key: 'customer', width: 22 },
        { header: 'Mobile', key: 'mobile', width: 16 },
        { header: 'Mode', key: 'mode', width: 12 },
        { header: 'Products', key: 'products', width: 28 },
        { header: 'Product Notes', key: 'productNotes', width: 28 },
        { header: 'Discussion', key: 'discussion', width: 45 },
        { header: 'Outcome', key: 'outcome', width: 28 },
        { header: 'Status', key: 'status', width: 18 },
    ];
    chats.forEach((c) => {
        const cust = c.customerId || {};
        sheet.addRow({
            date: formatChatDate(c.conversationDate),
            company: cust.company || cust.companyBrand || '',
            customer: cust.customerName || '',
            mobile: primaryMobileFromCustomer(cust) || allMobilesFromCustomer(cust),
            mode: c.mode || '',
            products: Array.isArray(c.interestedProducts) ? c.interestedProducts.join(', ') : '',
            productNotes: c.productNotes || '',
            discussion: c.discussionDetails || '',
            outcome: c.outcome || '',
            status: c.followUpStatus || '',
        });
    });
    return sheet;
};

const generateDashboardListExport = async (format, filters) => {
    const { data } = await queryFollowupDashboardList(filters, { limit: 'all' });
    const product = String(filters.product || '').trim();
    const chats = product ? await findProductRelatedConversations(product) : [];

    const fmt = String(format || 'excel').toLowerCase();

    if (fmt === 'excel' || fmt === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Follow-ups');
        sheet.columns = [
            { header: 'Company', key: 'company', width: 25 },
            { header: 'Customer', key: 'customer', width: 20 },
            { header: 'Mobile', key: 'mobile', width: 16 },
            { header: 'Due Date', key: 'date', width: 15 },
            { header: 'Priority', key: 'priority', width: 10 },
            { header: 'Type', key: 'type', width: 12 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'Note', key: 'note', width: 35 },
        ];
        data.forEach((r) =>
            sheet.addRow({
                company: r.companyName,
                customer: r.customerName,
                mobile: r.primaryContact?.mobile || (r.mobiles || [])[0] || '',
                date: r.reminderDate ? new Date(r.reminderDate).toLocaleDateString('en-IN') : '',
                priority: r.priority,
                type: r.followUpType,
                status: r.isClosed ? 'Closed' : 'Open',
                note: r.taskNote,
            })
        );
        if (product) {
            buildProductChatsWorksheet(workbook, chats, product);
            const summary = workbook.addWorksheet('Export Summary');
            summary.addRow(['Product filter', product]);
            summary.addRow(['Follow-ups exported', data.length]);
            summary.addRow(['Related chats exported', chats.length]);
            summary.addRow(['Generated at', new Date().toLocaleString('en-IN')]);
        }
        return workbook.xlsx.writeBuffer();
    }

    // Prefer Excel for reliability; PDF via puppeteer is best-effort
    if (fmt === 'pdf') {
        try {
            const html = `<html><body>
                <h1>Follow-up Dashboard${product ? ` — Product: ${product}` : ''}</h1>
                <h2>Follow-ups (${data.length})</h2>
                <table border="1" style="width:100%;border-collapse:collapse;font-size:11px;">
                <tr><th>Company</th><th>Customer</th><th>Due</th><th>Priority</th><th>Type</th><th>Note</th></tr>
                ${data
                    .map(
                        (r) =>
                            `<tr><td>${r.companyName || ''}</td><td>${r.customerName || ''}</td><td>${
                                r.reminderDate ? new Date(r.reminderDate).toLocaleDateString('en-IN') : ''
                            }</td><td>${r.priority || ''}</td><td>${r.followUpType || ''}</td><td>${
                                r.taskNote || ''
                            }</td></tr>`
                    )
                    .join('')}
                </table>
                ${
                    product
                        ? `<h2>Related Chats (${chats.length})</h2>
                <table border="1" style="width:100%;border-collapse:collapse;font-size:11px;">
                <tr><th>Date</th><th>Company</th><th>Products</th><th>Discussion</th><th>Outcome</th></tr>
                ${chats
                    .map((c) => {
                        const cust = c.customerId || {};
                        return `<tr><td>${
                            c.conversationDate ? new Date(c.conversationDate).toLocaleDateString('en-IN') : ''
                        }</td><td>${cust.company || cust.customerName || ''}</td><td>${
                            Array.isArray(c.interestedProducts) ? c.interestedProducts.join(', ') : ''
                        }</td><td>${(c.discussionDetails || '').replace(/</g, '&lt;')}</td><td>${
                            (c.outcome || '').replace(/</g, '&lt;')
                        }</td></tr>`;
                    })
                    .join('')}
                </table>`
                        : ''
                }
                </body></html>`;
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const pdf = await page.pdf({ format: 'A4', printBackground: true });
            await browser.close();
            return pdf;
        } catch (err) {
            // Fall back to Excel so export still works when Chrome/puppeteer is unavailable
            console.error('Follow-up dashboard PDF export failed, falling back to Excel:', err?.message || err);
            return generateDashboardListExport('excel', filters);
        }
    }

    if (fmt === 'docx') {
        return Buffer.from(
            `<html><body><h1>Follow-up Dashboard${product ? ` — ${product}` : ''}</h1>
            <p>Follow-ups: ${data.length}${product ? ` | Related chats: ${chats.length}` : ''}</p>
            <table border="1">
            <tr><th>Company</th><th>Customer</th><th>Due</th><th>Priority</th><th>Type</th><th>Note</th></tr>
            ${data
                .map(
                    (r) =>
                        `<tr><td>${r.companyName || ''}</td><td>${r.customerName || ''}</td><td>${
                            r.reminderDate ? new Date(r.reminderDate).toLocaleDateString('en-IN') : ''
                        }</td><td>${r.priority || ''}</td><td>${r.followUpType || ''}</td><td>${
                            r.taskNote || ''
                        }</td></tr>`
                )
                .join('')}
            </table></body></html>`
        );
    }

    throw new Error(`Unsupported export format: ${format}`);
};

/** Export only conversation/chat rows matching a product filter (e.g. DALI). */
const generateProductChatExport = async (format, filters) => {
    const product = String(filters.product || filters.q || '').trim();
    if (!product) {
        const err = new Error('Enter a product (e.g. DALI) to export related chats');
        err.statusCode = 400;
        throw err;
    }
    const chats = await findProductRelatedConversations(product);
    const fmt = String(format || 'excel').toLowerCase();

    if (fmt === 'excel' || fmt === 'xlsx' || fmt === 'pdf') {
        // Excel is the reliable deliverable; PDF requested still gets Excel content if puppeteer fails
        if (fmt === 'excel' || fmt === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            buildProductChatsWorksheet(workbook, chats, product);
            const summary = workbook.addWorksheet('Summary');
            summary.addRow(['Product', product]);
            summary.addRow(['Chat rows (all chats of matched customers)', chats.length]);
            summary.addRow([
                'Customers',
                new Set(chats.map((c) => String(c.customerId?._id || c.customerId || ''))).size,
            ]);
            summary.addRow(['Generated at', new Date().toLocaleString('en-IN')]);
            summary.addRow(['Note', 'Sheet 1 = one row per customer (all chats comma-separated); Sheet 2 = each chat as a row']);
            return workbook.xlsx.writeBuffer();
        }
        try {
            return generateDashboardListExport('pdf', { ...filters, product });
        } catch {
            const workbook = new ExcelJS.Workbook();
            buildProductChatsWorksheet(workbook, chats, product);
            return workbook.xlsx.writeBuffer();
        }
    }

    throw new Error(`Unsupported export format: ${format}`);
};


// --- Follow-up Task Report (Conversation-focused) ---

const queryFollowupTaskReportAll = async (filters) => {
    // Build Query

    const query = {};
    if (filters.fromDate || filters.toDate) {
        query.conversationDate = {};
        if (filters.fromDate) query.conversationDate.$gte = new Date(filters.fromDate);
        if (filters.toDate) query.conversationDate.$lte = new Date(filters.toDate);
    }

    // Map followUpType to mode if provided
    if (filters.followUpType && filters.followUpType !== 'ALL') {
        // Assuming map: CALL -> call, WHATSAPP -> whatsapp
        query.mode = filters.followUpType.toLowerCase();
    }

    const aggregation = [
        { $match: query },
        {
            $lookup: {
                from: 'customers',
                localField: 'customerId',
                foreignField: '_id',
                as: 'customer'
            }
        },
        { $unwind: '$customer' },
        {
            $project: {
                customerId: '$customer._id',
                companyName: '$customer.company',
                customerName: '$customer.customerName',
                conversationDate: 1,
                discussionDetails: 1,
                outcomeRemarks: '$outcome',
                mode: 1,
                createdAt: 1
            }
        },
        // Deduplicate: group by customerId + date + discussionDetails, keep the richest outcome
        {
            $group: {
                _id: {
                    customerId: '$customerId',
                    conversationDate: '$conversationDate',
                    discussionDetails: '$discussionDetails'
                },
                customerId: { $first: '$customerId' },
                companyName: { $first: '$companyName' },
                customerName: { $first: '$customerName' },
                conversationDate: { $first: '$conversationDate' },
                discussionDetails: { $first: '$discussionDetails' },
                outcomeRemarks: { $max: '$outcomeRemarks' }, // prefer non-null
                mode: { $first: '$mode' },
                createdAt: { $first: '$createdAt' }
            }
        },
        { $sort: { companyName: 1, conversationDate: -1 } }
    ];

    const data = await Conversation.aggregate(aggregation);
    return { data };
};

const queryFollowupTaskReportSingle = async (customerId, filters = {}) => {

    const customer = await Customer.findById(customerId).lean();
    if (!customer) throw new Error('Customer not found');

    const query = { customerId: new mongoose.Types.ObjectId(customerId) };
    if (filters.fromDate || filters.toDate) {
        query.conversationDate = {};
        if (filters.fromDate) query.conversationDate.$gte = new Date(filters.fromDate);
        if (filters.toDate) query.conversationDate.$lte = new Date(filters.toDate);
    }

    const conversations = await Conversation.find(query)
        .sort({ conversationDate: -1 })
        .lean()
        .exec();

    // Deduplicate: same date + same discussionDetails = same conversation
    const seen = new Map();
    const unique = [];
    for (const c of conversations) {
        const key = `${String(c.conversationDate).slice(0, 10)}_${c.discussionDetails?.trim()}`;
        if (!seen.has(key)) {
            seen.set(key, true);
            unique.push(c);
        }
    }

    return {
        customer,
        rows: unique.map(c => ({
            conversationDate: c.conversationDate,
            discussionDetails: c.discussionDetails,
            outcomeRemarks: c.outcome,
            mode: c.mode
        }))
    };
};

const generateFollowupTaskReportExport = async (format, filters, customerId = null) => {
    let dataRows = [];
    let singleCustomer = null;
    let sheetName = 'FOR ALL';

    if (customerId) {
        const result = await queryFollowupTaskReportSingle(customerId, filters);
        dataRows = result.rows;
        singleCustomer = result.customer;
        sheetName = 'FOR SINGLE';
    } else {
        const result = await queryFollowupTaskReportAll(filters);
        dataRows = result.data;
    }

    if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(sheetName);

        // Define generic column widths
        sheet.getColumn('A').width = 25; // Company / Date
        sheet.getColumn('B').width = 20; // Date / Discussion
        sheet.getColumn('C').width = 40; // Discussion / Outcome
        sheet.getColumn('D').width = 30; // Outcome

        let startRow = 1;

        if (customerId && singleCustomer) {
            // "FOR SINGLE" Header Format
            // Row 1: A="Company NAME :", C="<Company>"
            sheet.mergeCells('A1:B1');
            const c1 = sheet.getCell('A1');
            c1.value = 'Company NAME :';
            c1.font = { bold: true };

            sheet.mergeCells('C1:D1');
            const c2 = sheet.getCell('C1');
            c2.value = singleCustomer.company || singleCustomer.customerName;
            c2.font = { bold: true };

            startRow = 3;
        }

        // Table Header
        // For ALL: A=Company, B=Date, C=Discussion, D=Outcome
        // But Template says: A=Company, B=Date, C-D Merged = NEW CONVERSATION ENTRY -> Row2 C=Discussion, D=Outcome

        // Let's implement the specific merged header structure
        const headerRow1Index = startRow;
        const headerRow2Index = startRow + 1;

        if (!customerId) {
            sheet.getCell(`A${headerRow1Index}`).value = 'Company';
        }

        sheet.getCell(`B${headerRow1Index}`).value = 'DATE OF CONVERSATION';

        // Merge C and D for "NEW CONVERSATION ENTRY"
        sheet.mergeCells(`C${headerRow1Index}:D${headerRow1Index}`);
        const mergedHeader = sheet.getCell(`C${headerRow1Index}`);
        mergedHeader.value = 'NEW CONVERSATION ENTRY';
        mergedHeader.alignment = { horizontal: 'center' };
        mergedHeader.font = { bold: true };

        // Row 2 Sub-headers
        sheet.getCell(`C${headerRow2Index}`).value = 'DISCUSSION DETAILS';
        sheet.getCell(`D${headerRow2Index}`).value = 'OUT COME';

        // Apply styles to headers
        [headerRow1Index, headerRow2Index].forEach(rIdx => {
            const row = sheet.getRow(rIdx);
            row.font = { bold: true };
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Data Rows
        let currentRow = headerRow2Index + 1;
        dataRows.forEach(row => {
            const dateStr = new Date(row.conversationDate).toLocaleDateString('en-GB'); // dd-mm-yyyy

            if (!customerId) {
                // FOR ALL: Col A is Company
                sheet.getCell(`A${currentRow}`).value = row.companyName || row.customerName;
            }

            sheet.getCell(`B${currentRow}`).value = dateStr;
            sheet.getCell(`C${currentRow}`).value = row.discussionDetails;
            sheet.getCell(`D${currentRow}`).value = row.outcomeRemarks;

            // Wrap text
            sheet.getCell(`C${currentRow}`).alignment = { wrapText: true };
            sheet.getCell(`D${currentRow}`).alignment = { wrapText: true };

            // Borders
            ['B', 'C', 'D'].forEach(col => {
                const cell = sheet.getCell(`${col}${currentRow}`);
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            if (!customerId) {
                const cell = sheet.getCell(`A${currentRow}`);
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            }

            currentRow++;
        });

        return workbook.xlsx.writeBuffer();
    }

    // PDF / DOCX uses HTML Table
    const htmlContent = `
     <html>
         <head>
             <style>
                 body { font-family: Arial, sans-serif; font-size: 11px; }
                 table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                 th, td { border: 1px solid #000; padding: 5px; vertical-align: top; text-align: left; }
                 th { background-color: #f0f0f0; font-weight: bold; }
                 h1 { font-size: 16px; margin-bottom: 10px; }
                 .header-card { margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; }
             </style>
         </head>
         <body>
             ${customerId ? `
                 <div class="header-card">
                     <h1>Company NAME: ${singleCustomer.company || singleCustomer.customerName}</h1>
                 </div>
             ` : '<h1>Follow-up Task Report</h1>'}

             <table>
                 <thead>
                     <tr>
                         ${!customerId ? '<th>Company</th>' : ''}
                         <th>Date of Conversation</th>
                         <th>Discussion Details</th>
                         <th>Outcome</th>
                     </tr>
                 </thead>
                 <tbody>
                     ${dataRows.map(r => `
                         <tr>
                             ${!customerId ? `<td>${r.companyName || r.customerName || ''}</td>` : ''}
                             <td>${new Date(r.conversationDate).toLocaleDateString('en-GB')}</td>
                             <td>${(r.discussionDetails || '-').replace(/\n/g, '<br/>')}</td>
                             <td>${(r.outcomeRemarks || '-').replace(/\n/g, '<br/>')}</td>
                         </tr>
                     `).join('')}
                 </tbody>
             </table>
         </body>
     </html>
 `;

    if (format === 'docx') {
        return Buffer.from(htmlContent);
    }

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
    await browser.close();
    return pdfBuffer;
};


/**
 * Manage Tasks Page — full task list with role-based access
 * Reuses same logic as queryTaskReminderReport but adds createdById filter
 */
const queryManageTasks = async (filters, options) => {

    const tab = filters.tab || 'ALL';
    const andConditions = [];

    // IST day boundaries
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);

    const startOfTodayIST = new Date(istTime);
    startOfTodayIST.setUTCHours(0, 0, 0, 0);
    const startOfTodayUTC = new Date(startOfTodayIST.getTime() - istOffset);

    const endOfTodayIST = new Date(istTime);
    endOfTodayIST.setUTCHours(23, 59, 59, 999);
    const endOfTodayUTC = new Date(endOfTodayIST.getTime() - istOffset);

    if (tab === 'TODAY') {
        andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gte: startOfTodayUTC, $lte: endOfTodayUTC } });
    } else if (tab === 'UPCOMING') {
        andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gt: endOfTodayUTC } });
    } else if (tab === 'OVERDUE') {
        andConditions.push({ status: { $nin: ['COMPLETED', 'CANCELLED'] }, dueDate: { $lt: startOfTodayUTC } });
    } else if (tab === 'CLOSED') {
        andConditions.push({ status: { $in: ['COMPLETED', 'CANCELLED'] } });
    }
    // ALL: no date/status restriction

    if (filters.priority) andConditions.push({ priority: filters.priority });
    if (filters.status && filters.status !== 'ALL') andConditions.push({ status: filters.status });
    if (filters.groupId) andConditions.push({ groupId: filters.groupId });
    if (filters.assigneeId) andConditions.push({ assigneeIds: filters.assigneeId });
    if (filters.createdById) andConditions.push({ createdBy: filters.createdById });

    // Group tasks with showInGeneralTaskLists=false stay out of Today/Upcoming/Overdue
    // unless the user explicitly selected that group.
    if (!filters.groupId) {
        const excludedGroupIds = await TaskGroup.find({
            showInGeneralTaskLists: false,
            isActive: { $ne: false },
        }).distinct('_id');
        if (excludedGroupIds.length) {
            andConditions.push({
                $or: [
                    { groupId: null },
                    { groupId: { $exists: false } },
                    { groupId: { $nin: excludedGroupIds } },
                ],
            });
        }
    }

    if (filters.dateFrom || filters.dateTo) {
        const dateFilter = {};
        if (filters.dateFrom) dateFilter.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) dateFilter.$lte = new Date(filters.dateTo);
        andConditions.push({ dueDate: dateFilter });
    }

    if (filters.search) {
        andConditions.push({
            $or: [
                { title: { $regex: filters.search, $options: 'i' } },
                { description: { $regex: filters.search, $options: 'i' } }
            ]
        });
    }

    // Role-based access
    if (filters.user) {
        const role = filters.user.role;
        if (role !== 'admin') {
            // STRICT Root Filter Layer: Users can ONLY see tasks they are directly assigned to, have created, or assigned to ALL
            andConditions.push({
                $or: [
                    { assigneeIds: filters.user.id },
                    { createdBy: filters.user.id },
                    { assignToAll: true }
                ]
            });
        }
    }

    const filter = andConditions.length ? { $and: andConditions } : {};
    console.log('DEBUG ManageTasks Filter:', JSON.stringify(filter, null, 2), 'USER ROLE:', filters.user?.role, 'USER ID:', filters.user?.id);
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 50;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
        Task.find(filter)
            .populate('assigneeIds', 'name email')
            .populate('createdBy', 'name email')
            .populate('groupId', 'name showInGeneralTaskLists isHighlighted recurrenceType')
            .sort({ status: -1, dueDate: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Task.countDocuments(filter)
    ]);

    return {
        data: tasks,
        meta: { total, page, limit, pages: Math.ceil(total / limit) }
    };
};

/**
 * Task Reminder Report (Internal Tasks)
 */
const queryTaskReminderReport = async (filters, options) => {

    const tab = filters.tab || 'TODAY';
    const andConditions = [];

    // Current time logic for Asia/Kolkata (IST)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);

    const startOfTodayIST = new Date(istTime);
    startOfTodayIST.setUTCHours(0, 0, 0, 0);
    const startOfTodayUTC = new Date(startOfTodayIST.getTime() - istOffset);

    const endOfTodayIST = new Date(istTime);
    endOfTodayIST.setUTCHours(23, 59, 59, 999);
    const endOfTodayUTC = new Date(endOfTodayIST.getTime() - istOffset);

    if (tab === 'TODAY') {
        andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gte: startOfTodayUTC, $lte: endOfTodayUTC } });
    } else if (tab === 'UPCOMING') {
        andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gt: endOfTodayUTC } });
    } else if (tab === 'OVERDUE') {
        andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $lt: startOfTodayUTC } });
    } else if (tab === 'COMPLETED' || tab === 'CLOSED') {
        andConditions.push({ status: 'COMPLETED' });
    } else if (tab === 'RECURRING') {
        andConditions.push({ 'recurrence.enabled': true });
    }

    if (filters.priority) andConditions.push({ priority: filters.priority });
    if (filters.status && filters.status !== 'ALL') andConditions.push({ status: filters.status });
    if (filters.taskCategoryId) andConditions.push({ taskCategoryId: filters.taskCategoryId });
    if (filters.groupId) andConditions.push({ groupId: filters.groupId });
    if (filters.assigneeId) andConditions.push({ assigneeIds: filters.assigneeId });

    if (filters.dateFrom || filters.dateTo) {
        const dateFilter = {};
        if (filters.dateFrom) dateFilter.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) dateFilter.$lte = new Date(filters.dateTo);
        andConditions.push({ dueDate: dateFilter });
    }

    if (filters.search) {
        andConditions.push({
            $or: [
                { title: { $regex: filters.search, $options: 'i' } },
                { description: { $regex: filters.search, $options: 'i' } }
            ]
        });
    }

    // Role-based filtering (similar to task.controller)
    if (filters.user) {
        if (filters.user.role === 'admin') {
            // Admin sees all
        } else {
            andConditions.push({
                $or: [
                    { assigneeIds: filters.user.id },
                    { createdBy: filters.user.id },
                    { assignToAll: true }
                ]
            });
        }
    }

    const filter = andConditions.length ? { $and: andConditions } : {};
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 50;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;
    const sort = { dueDate: 1, createdAt: -1 };

    const [tasks, total] = await Promise.all([
        Task.find(filter)
            .populate('assigneeIds', 'name email username')
            .populate('createdBy', 'name email username')
            .populate('taskCategoryId', 'name')
            .populate('groupId', 'name')
            .sort(sort)
            .skip(skip)
            .limit(limit),
        Task.countDocuments(filter)
    ]);

    return {
        data: tasks,
        meta: { total, page, limit, pages: Math.ceil(total / limit) }
    };
};

/**
 * Build Item Master Report Query
 */
const buildItemReportQuery = (filters) => {
    const filter = {};
    if (filters.itemCategory) filter.itemCategory = filters.itemCategory;
    if (filters.itemType) filter.itemType = filters.itemType;
    if (filters.itemGroupName) filter.itemGroupName = filters.itemGroupName;
    if (filters.isActive !== undefined) filter.isActive = filters.isActive === 'true';

    if (filters.search || filters.q) {
        const search = filters.search || filters.q;
        const searchParts = search.split(/\s+[—\-]\s+/).map(s => s.trim()).filter(Boolean);

        if (searchParts.length > 1) {
            filter.$or = [
                { itemCode: { $regex: searchParts[0], $options: 'i' } },
                { itemName: { $regex: searchParts[1], $options: 'i' } }
            ];
        } else {
            const isNumeric = /^\d+$/.test(search.trim());
            if (isNumeric) {
                const num = search.trim();
                filter.$or = [
                    { itemCode: { $regex: `(?:^|\\D)0*${num}$`, $options: 'i' } },
                    { itemName: { $regex: `(^|[^0-9])${num}([^0-9]|$)`, $options: 'i' } },
                    { hsnCode: { $regex: num, $options: 'i' } },
                ];
            } else {
                const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const standardRegex = { $regex: safeSearch, $options: 'i' };
                filter.$or = [
                    { itemName: standardRegex },
                    { itemCode: standardRegex },
                    { hsnCode: standardRegex },
                ];
            }
        }
    }
    return filter;
};

/**
 * Generate Item Master Excel Report
 */
const generateItemExcelReport = async (filters, options) => {
    const filter = buildItemReportQuery(filters);
    const [field, dir] = (options.sortBy || 'itemName:asc').split(':');
    const sort = { [field]: dir === 'desc' ? -1 : 1 };

    const items = await Item.find(filter)
        .sort(sort)
        .limit(10000)
        .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Item Master');

    worksheet.columns = [
        { header: 'Item Code', key: 'itemCode', width: 20 },
        { header: 'Item Name', key: 'itemName', width: 35 },
        { header: 'Group', key: 'itemGroupName', width: 20 },
        { header: 'Category', key: 'itemCategory', width: 20 },
        { header: 'Type', key: 'itemType', width: 15 },
        { header: 'UOM', key: 'uom', width: 10 },
        { header: 'HSN Code', key: 'hsnCode', width: 15 },
        { header: 'Current Stock', key: 'currentStock', width: 15 },
        { header: 'Selling Price', key: 'sellingPrice', width: 15 },
        { header: 'Status', key: 'status', width: 12 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    items.forEach(i => {
        worksheet.addRow({
            itemCode: i.itemCode,
            itemName: i.itemName,
            itemGroupName: i.itemGroupName || '-',
            itemCategory: i.itemCategory,
            itemType: i.itemType,
            uom: i.uom,
            hsnCode: i.hsnCode || '-',
            currentStock: i.currentStock,
            sellingPrice: i.sellingPrice,
            status: i.isActive ? 'Active' : 'Inactive'
        });
    });

    return await workbook.xlsx.writeBuffer();
};

/**
 * Generate Item Master PDF Report
 */
const generateItemPDFReport = async (filters, options) => {
    const filter = buildItemReportQuery(filters);
    const [field, dir] = (options.sortBy || 'itemName:asc').split(':');
    const sort = { [field]: dir === 'desc' ? -1 : 1 };

    const items = await Item.find(filter)
        .sort(sort)
        .limit(1000)
        .lean();

    const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: Helvetica, sans-serif; font-size: 10px; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
                th { background-color: #f3f4f6; }
                h1 { margin-bottom: 5px; }
                .summary { margin-bottom: 15px; font-size: 11px; color: #666; }
            </style>
        </head>
        <body>
            <h1>Item Master Report</h1>
            <div class="summary">
                Generated on: ${new Date().toLocaleString()} | Total Items: ${items.length}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Item Name</th>
                        <th>Group</th>
                        <th>Category</th>
                        <th>UOM</th>
                        <th>Stock</th>
                        <th>Rate</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(i => `
                        <tr>
                            <td>${i.itemCode}</td>
                            <td>${i.itemName}</td>
                            <td>${i.itemGroupName || '-'}</td>
                            <td>${i.itemCategory}</td>
                            <td>${i.uom}</td>
                            <td>${i.currentStock}</td>
                            <td>₹${(i.sellingPrice || 0).toFixed(2)}</td>
                            <td>${i.isActive ? 'Active' : 'Inactive'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    await browser.close();
    return pdfBuffer;
};

export default {
    buildReportQuery,
    queryCustomerReport,
    getReportOptions,
    exportReportToCSV,
    generateExcelReport,
    generatePDFReport,
    queryFollowUpReport,
    exportFollowUpToCSV,
    generateFollowUpExcelReport,
    generateFollowUpPDFReport,
    generateReminderExcelReport,
    generateReminderPDFReport,
    generateOpenReminderExcelReport,
    generateOpenReminderPDFReport,
    // Dashboard
    queryFollowupDashboardList,
    queryCustomerTimeline,
    generateDashboardListExport,
    generateProductChatExport,
    // Task Report
    queryFollowupTaskReportAll,
    queryFollowupTaskReportSingle,
    generateFollowupTaskReportExport,
    // Task Reminder Report
    queryTaskReminderReport,
    // Manage Tasks Page
    queryManageTasks,
    // Item Master
    generateItemExcelReport,
    generateItemPDFReport
};
