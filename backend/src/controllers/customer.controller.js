import mongoose from 'mongoose';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import customerService from '../services/customer.service.js';
import conversationService from '../services/conversation.service.js';
import Followup from '../models/followup.model.js';
import Conversation from '../models/conversation.model.js';
import Reminder from '../models/reminder.model.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const createCustomer = catchAsync(async (req, res) => {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).send(new ApiResponse(201, customer, 'Customer created successfully'));
});

const getCustomers = catchAsync(async (req, res) => {
    console.log('Customers API hit with query:', req.query);
    const filter = pick(req.query, ['customerName', 'status']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
    const result = await customerService.queryCustomers(filter, options);
    res.send(new ApiResponse(200, result, 'Customers fetched successfully'));
});

const getCustomer = catchAsync(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id);
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }
    res.send(new ApiResponse(200, customer));
});

const getCustomerConversations = catchAsync(async (req, res) => {
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    const result = await conversationService.getConversationsByCustomer(req.params.id, options);
    res.send(new ApiResponse(200, result, 'Customer conversations fetched successfully'));
});

const getConversationHistory = catchAsync(async (req, res) => {
    const { customerId } = req.params;
    const { fromDate, toDate, mode, search } = req.query;

    console.log(`📜 Fetching history for customer: ${customerId}, Filters:`, req.query);

    let id;
    try {
        id = new mongoose.Types.ObjectId(customerId);
    } catch (err) {
        throw new ApiError(400, 'Invalid Customer ID');
    }

    // Build Filters
    const convQuery = { customerId: id };
    const followupQuery = { customerId: id };

    // 1. Date Filter
    if (fromDate || toDate) {
        const dateFilter = {};
        if (fromDate) dateFilter.$gte = new Date(fromDate);
        if (toDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        convQuery.conversationDate = dateFilter;
        followupQuery.updatedAt = dateFilter; // Use updatedAt for followups
    }

    // 2. Mode Filter
    if (mode && mode !== 'All') {
        // Conversation uses lowercase: 'call', 'whatsapp'
        // Followup uses uppercase: 'CALL', 'WHATSAPP'
        convQuery.mode = mode.toLowerCase();
        followupQuery.followUpType = mode.toUpperCase();
    }

    // 3. Search Filter
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        convQuery.$or = [
            { discussionDetails: searchRegex },
            { outcome: searchRegex }
        ];
        followupQuery.whatToTalkNext = searchRegex;
    }

    // Fetch from Conversations
    const conversations = await Conversation.find(convQuery)
        .sort({ conversationDate: -1, createdAt: -1 })
        .lean();
    console.log(`✅ Found ${conversations.length} records in Conversation model`);

    // Fetch from Followups
    const followups = await Followup.find(followupQuery)
        .sort({ updatedAt: -1 })
        .lean();
    console.log(`✅ Found ${followups.length} records in Followup model`);

    const followupHistory = followups.map(f => ({
        _id: f._id,
        conversationDate: f.updatedAt,
        mode: f.followUpType === 'WHATSAPP' ? 'whatsapp' : 'call',
        discussionDetails: `[Follow-up] ${f.whatToTalkNext || 'No remarks'}`,
        outcome: `Next Call: ${f.nextCallDate ? new Date(f.nextCallDate).toISOString().split('T')[0] : 'N/A'}`,
        createdAt: f.createdAt,
        isFollowup: true
    }));

    // Fetch from Reminders (History & Closed)
    const reminders = await Reminder.find({ customerId: id }).lean();
    console.log(`✅ Found ${reminders.length} records in Reminder model`);

    const reminderHistory = [];

    reminders.forEach(r => {
        // 1. Reschedule History
        if (r.rescheduleHistory && r.rescheduleHistory.length > 0) {
            r.rescheduleHistory.forEach(h => {
                // Apply Date Filter to history items if needed
                let include = true;
                if (fromDate && new Date(h.changedAt) < new Date(fromDate)) include = false;
                if (toDate) {
                    const end = new Date(toDate);
                    end.setHours(23, 59, 59, 999);
                    if (new Date(h.changedAt) > end) include = false;
                }

                if (include) {
                    reminderHistory.push({
                        _id: h._id || `${r._id}_res_${h.changedAt.getTime()}`,
                        conversationDate: h.changedAt,
                        mode: 'Rescheduled',
                        discussionDetails: `Date changed from ${h.fromDate ? new Date(h.fromDate).toLocaleDateString() : 'N/A'} to ${h.toDate ? new Date(h.toDate).toLocaleDateString() : 'N/A'}`,
                        outcome: h.reason ? `Reason: ${h.reason}` : 'No reason provided',
                        createdAt: h.changedAt,
                        isSystem: true
                    });
                }
            });
        }

        // 2. Closed History
        if (r.isClosed && r.closedAt) {
            let include = true;
            if (fromDate && new Date(r.closedAt) < new Date(fromDate)) include = false;
            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (new Date(r.closedAt) > end) include = false;
            }

            if (include) {
                reminderHistory.push({
                    _id: `${r._id}_closed`,
                    conversationDate: r.closedAt,
                    mode: 'Task Closed',
                    discussionDetails: `Task marked as closed/completed.`,
                    outcome: r.taskNote ? `Note: ${r.taskNote}` : '',
                    createdAt: r.closedAt,
                    isSystem: true
                });
            }
        }

        // 3. Open/Due Task (showing the reminder itself as an event)
        // This ensures even if no action is taken, the scheduled task appears in history
        if (!r.isClosed) {
            let include = true;
            // For open tasks, we use reminderDate
            if (fromDate && new Date(r.reminderDate) < new Date(fromDate)) include = false;
            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (new Date(r.reminderDate) > end) include = false;
            }

            if (include) {
                reminderHistory.push({
                    _id: `${r._id}_open`,
                    conversationDate: r.reminderDate,
                    mode: 'Scheduled Task',
                    discussionDetails: `Task Due: ${r.taskNote || 'No description'}`,
                    outcome: `Status: ${r.priority} Priority`,
                    createdAt: r.createdAt,
                    isSystem: true
                });
            }
        }
    });

    // Merge and Sort
    const mergedHistory = [...conversations, ...followupHistory, ...reminderHistory].sort((a, b) => {
        return new Date(b.conversationDate) - new Date(a.conversationDate);
    });

    res.send(new ApiResponse(200, mergedHistory, 'History fetched successfully'));
});

const updateCustomer = catchAsync(async (req, res) => {
    console.log('📝 PUT /customers/:id called with ID:', req.params.id);
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));

    const customer = await customerService.updateCustomerById(req.params.id, req.body);

    console.log('✅ Customer updated in DB:', customer._id);
    res.send(new ApiResponse(200, customer, 'Customer updated successfully'));
});

const deleteCustomer = catchAsync(async (req, res) => {
    await customerService.deleteCustomerById(req.params.id);
    res.status(200).send(new ApiResponse(200, null, 'Customer deleted successfully'));
});

// Download Excel Template
const downloadTemplate = catchAsync(async (req, res) => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Template');

    // Define columns with headers
    worksheet.columns = [
        { header: 'Customer', key: 'customerName', width: 25 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Primary Contact', key: 'contactName', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Mobile 2', key: 'mobile2', width: 15 },
        { header: 'Mobile 3', key: 'mobile3', width: 15 },
        { header: 'Mobile 4', key: 'mobile4', width: 15 },
        { header: 'Mobile 5', key: 'mobile5', width: 15 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'Pincode', key: 'pincode', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Business Type', key: 'customerType', width: 30 },
        { header: 'Interested Products', key: 'interestedProducts', width: 50 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add example row
    worksheet.addRow({
        customerName: 'ABC Corporation',
        company: 'ABC Corp',
        contactName: 'John Doe',
        mobile: '9876543210',
        mobile2: '9876543211',
        mobile3: '',
        mobile4: '',
        mobile5: '',
        email: 'john@example.com',
        address: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        status: 'lead',
        customerType: 'led_light_manufacturer',
        interestedProducts: 'DALI DRIVER & DIMMER, SMART DRIVER – BLE'
    });

    // Add data validation for dropdowns
    const customerTypes = [
        'led_light_manufacturer',
        'led_light_showroom',
        'home_automation_provider',
        'interior_designer',
        'builders',
        'dealer',
        'distributor'
    ];

    const statuses = ['lead', 'running_high', 'running_low', 'inactive'];

    // Apply data validation for 1000 rows
    for (let i = 2; i <= 1001; i++) {
        // Status validation (Column P - 16)
        worksheet.getCell(`P${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${statuses.join(',')}"`]
        };

        // Business Type validation (Column Q - 17)
        worksheet.getCell(`Q${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${customerTypes.join(',')}"`]
        };
    }

    // Set response headers
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        'attachment; filename=Customer_Import_Template.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
});


// Bulk Import Customers
const importCustomers = catchAsync(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, 'No file uploaded');
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();

    // Check file extension
    const filename = req.file.originalname.toLowerCase();
    if (filename.endsWith('.xls')) {
        throw new ApiError(400, 'Legacy Excel files (.xls) are not supported. Please save your file as .xlsx (Excel Workbook) and try again.');
    }

    try {
        await workbook.xlsx.load(req.file.buffer);
    } catch (err) {
        throw new ApiError(400, 'Failed to parse Excel file. Please ensure it is a valid .xlsx file.');
    }

    // Get first visible worksheet or any worksheet as fallback
    let worksheet = workbook.worksheets.find(s => s.state === 'visible');
    if (!worksheet) {
        worksheet = workbook.worksheets[0] || workbook.getWorksheet(1);
    }

    if (!worksheet) {
        throw new ApiError(400, `The Excel file "${req.file.originalname}" contains no readable worksheets. Please check if the file is empty or corrupted.`);
    }
    const results = {
        success: 0,
        failed: 0,
        errors: [],
        duplicates: 0
    };

    const customersToInsert = [];
    const seenMobiles = new Set();
    const seenEmails = new Set();

    // Helper function to extract text from Excel cell
    const getCellText = (cell) => {
        const value = cell.value;

        if (value === null || value === undefined) {
            return '';
        }

        // Handle rich text
        if (value.richText) {
            return value.richText.map(part => part.text).join('').trim();
        }

        // Handle hyperlink
        if (value.text !== undefined) {
            return String(value.text).trim();
        }

        // Handle formula result
        if (value.result !== undefined) {
            return String(value.result).trim();
        }

        // Handle plain value
        return String(value).trim();
    };

    // Skip header row, start from row 2
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        try {
            const customerName = getCellText(row.getCell(1)) || '';
            const company = getCellText(row.getCell(2)) || '';
            const contactName = getCellText(row.getCell(3)) || '';
            const mobile = getCellText(row.getCell(4)) || '';
            const mobile2 = getCellText(row.getCell(5)) || '';
            const mobile3 = getCellText(row.getCell(6)) || '';
            const mobile4 = getCellText(row.getCell(7)) || '';
            const mobile5 = getCellText(row.getCell(8)) || '';
            const email = getCellText(row.getCell(9)) || '';
            const address = getCellText(row.getCell(10)) || '';
            const city = getCellText(row.getCell(11)) || '';
            const state = getCellText(row.getCell(12)) || '';
            const pincode = getCellText(row.getCell(13)) || '';
            const status = getCellText(row.getCell(14)) || 'lead';
            const customerType = getCellText(row.getCell(15)) || '';
            const interestedProductsStr = getCellText(row.getCell(16)) || '';

            // Skip completely empty rows
            if (!customerName && !company && !contactName && !mobile && !email && !address && !city) {
                return;
            }

            // Validation
            const errors = [];

            if (mobile && !/^\d{10}$/.test(mobile)) {
                errors.push('Mobile must be 10 digits');
            }

            // Check for duplicates within file
            if (mobile && seenMobiles.has(mobile)) {
                errors.push(`Duplicate mobile ${mobile} in file`);
                results.duplicates++;
            } else if (mobile) {
                seenMobiles.add(mobile);
            }

            if (email && seenEmails.has(email)) {
                errors.push(`Duplicate email ${email} in file`);
                results.duplicates++;
            } else if (email) {
                seenEmails.add(email);
            }

            // Validate email format
            if (email && !/^\S+@\S+\.\S+$/i.test(email)) {
                errors.push('Invalid email format');
            }


            // Validate enums
            const validCustomerTypes = [
                'led_light_manufacturer',
                'led_light_showroom',
                'home_automation_provider',
                'interior_designer',
                'builders',
                'dealer',
                'distributor'
            ];

            if (customerType && !validCustomerTypes.includes(customerType)) {
                errors.push(`Invalid customer type: ${customerType}`);
            }

            const validStatuses = ['lead', 'running_high', 'running_low', 'inactive'];
            if (status && !validStatuses.includes(status)) {
                errors.push(`Invalid status: ${status}`);
            }

            // Parse interested products
            const interestedProducts = interestedProductsStr
                ? interestedProductsStr.split(',').map(p => p.trim()).filter(p => p)
                : [];

            if (errors.length > 0) {
                results.errors.push({
                    row: rowNumber,
                    mobile,
                    contactName,
                    errors
                });
                results.failed++;
            } else {
                // Build customer object
                customersToInsert.push({
                    customerName,
                    contactPersons: [
                        {
                            name: contactName,
                            mobile,
                            mobile2,
                            mobile3,
                            mobile4,
                            mobile5,
                            email,
                            isPrimary: true
                        }
                    ],
                    company,
                    customerType,
                    city,
                    state,
                    address,
                    pincode,
                    status,
                    interestedProducts
                });
            }
        } catch (err) {
            results.errors.push({
                row: rowNumber,
                errors: [`Unexpected error: ${err.message}`]
            });
            results.failed++;
        }
    });

    // Check for existing customers by mobile
    if (customersToInsert.length > 0) {
        // Only check for mobiles that are provided
        const mobiles = customersToInsert
            .map(c => c.contactPersons[0].mobile)
            .filter(m => m !== '');

        let existingMobiles = new Set();
        if (mobiles.length > 0) {
            const existingCustomers = await customerService.findByMobiles(mobiles);
            existingMobiles = new Set(
                existingCustomers.flatMap(c => c.contactPersons.map(cp => cp.mobile))
            );
        }

        const finalInserts = [];
        customersToInsert.forEach(customer => {
            const primaryMobile = customer.contactPersons[0].mobile;
            if (primaryMobile && existingMobiles.has(primaryMobile)) {
                results.errors.push({
                    mobile: primaryMobile,
                    contactName: customer.contactPersons[0].name,
                    errors: ['Customer with this mobile already exists']
                });
                results.failed++;
                results.duplicates++;
            } else {
                finalInserts.push(customer);
            }
        });

        // Insert valid customers
        if (finalInserts.length > 0) {
            await customerService.bulkCreateCustomers(finalInserts);
            results.success = finalInserts.length;
        }
    }

    res.send(new ApiResponse(200, results, 'Import completed'));
});

export default {
    createCustomer,
    getCustomers,
    getCustomer,
    getCustomerConversations,
    getConversationHistory,
    updateCustomer,
    deleteCustomer,
    downloadTemplate,
    importCustomers,
};
