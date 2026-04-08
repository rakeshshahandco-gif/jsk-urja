import mongoose from 'mongoose';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import customerService from '../services/customer.service.js';
import conversationService from '../services/conversation.service.js';
import Followup from '../models/followup.model.js';
import Conversation from '../models/conversation.model.js';
import Reminder from '../models/reminder.model.js';
import Customer from '../models/customer.model.js';
import { GSTImportLog } from '../models/gstImportLog.model.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const createCustomer = catchAsync(async (req, res) => {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).send(new ApiResponse(201, customer, 'Customer created successfully'));
});

const generateCustomerCode = catchAsync(async (req, res) => {
    const code = await customerService.genCustomerCode();
    res.status(200).send(new ApiResponse(200, { customerCode: code }, 'Customer code generated successfully'));
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

const getCustomerTypes = catchAsync(async (req, res) => {
    const types = await customerService.getCustomerTypes();
    res.send(new ApiResponse(200, types, 'Customer types fetched successfully'));
});

const getCustomerStickers = catchAsync(async (req, res) => {
    const stickers = await customerService.getCustomerStickers();
    res.send(new ApiResponse(200, stickers, 'Customer stickers fetched successfully'));
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

const searchCustomers = catchAsync(async (req, res) => {
    const { q } = req.query;
    console.log(`🔍 Customer search hit for: "${q}"`);

    if (!q || q.length < 2) {
        return res.send(new ApiResponse(200, [], 'Query too short'));
    }

    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startsWithRegex = { $regex: '^' + escapedQ, $options: 'i' };
    const baseFilter = {
        isDeleted: { $ne: true },
        $or: [
            { customerName: startsWithRegex },
            { company: startsWithRegex },
            { companyBrand: startsWithRegex },
            { gstNumber: startsWithRegex },
            { 'contactPersons.name': startsWithRegex },
            { 'contactPersons.mobile': startsWithRegex },
            { 'contactPersons.email': startsWithRegex },
        ],
    };

    // Diagnostics: Count all including inactive
    const totalFound = await Customer.countDocuments(baseFilter);
    console.log(`📊 Found total ${totalFound} matches (active + inactive)`);

    const filter = {
        ...baseFilter,
    };

    const customers = await Customer.find(filter)
        .sort({ company: 1, customerName: 1 })
        .limit(15)
        .lean();

    console.log(`✅ Returning ${customers.length} active customers`);

    const formattedResults = customers.map(c => {
        const primaryContact = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};
        const stateName = c.state || '';
        let stateCode = c.stateCode || '';
        if (!stateCode && c.gstNumber && c.gstNumber.length >= 2) {
            stateCode = c.gstNumber.substring(0, 2);
        }

        const addrParts = [c.address, c.taluka, c.city, c.district].filter(Boolean);
        let fullAddress = addrParts.join(', ');
        if (c.pincode) fullAddress += ` - ${c.pincode}`;

        // Comprehensive name display (Use only company name as per user request)
        let displayName = c.company || c.customerName || 'No Name';

        return {
            id: c._id,
            name: displayName,
            company: c.company || '',
            customerName: c.customerName || '',
            brand: c.companyBrand || '',
            phone: primaryContact.mobile || '',
            email: c.companyEmail || primaryContact.email || '',
            gstin: c.gstNumber || '',
            state: stateName,
            stateCode: stateCode,
            billingAddress: fullAddress,
            shippingAddress: fullAddress,
            customerCode: c.customerCode || '',
            customerType: c.customerType || '',
            gstType: c.gstType || '',
            city: c.city || '',
            creditPeriod: c.creditPeriod || 0,
            paymentType: c.paymentType || 'Credit',
        };
    });

    res.send(new ApiResponse(200, formattedResults));
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
        { header: 'Area', key: 'city', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'Pincode', key: 'pincode', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Business Type', key: 'customerType', width: 30 },
        { header: 'Interested Products', key: 'interestedProducts', width: 50 },
        { header: 'GST NO', key: 'gstNumber', width: 20 },
        { header: 'GST REGISTRATION TYPE', key: 'gstRegistrationType', width: 25 },
        { header: 'GST TYPE', key: 'gstType', width: 20 }
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
        // Status validation (Column N - 14)
        worksheet.getCell(`N${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${statuses.join(',')}"`]
        };

        // Business Type validation (Column O - 15)
        worksheet.getCell(`O${i}`).dataValidation = {
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
            let gstNumber = getCellText(row.getCell(17)) || '';
            let gstRegistrationType = getCellText(row.getCell(18)) || '';
            let gstType = getCellText(row.getCell(19)) || '';

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
                const finalGstNumber = (gstNumber || '').trim().toUpperCase();
                const isMaharashtra = (state && state.trim().toLowerCase() === 'maharashtra') || finalGstNumber.startsWith('27');
                const calculatedGstType = (state || finalGstNumber.length >= 2) ? (isMaharashtra ? 'CGST / SGST' : 'IGST') : '';
                
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
                    interestedProducts,
                    gstNumber: finalGstNumber,
                    gstRegistrationType: gstRegistrationType || (finalGstNumber ? 'Registered' : 'Consumer'),
                    gstType: gstType || calculatedGstType
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

    // Upsert Customers by Mobile or Company Name
    if (customersToInsert.length > 0) {
        // Query existing customers by mobile OR company
        const mobiles = customersToInsert.map(c => (c.contactPersons[0].mobile || '').trim()).filter(m => !!m);
        const companies = customersToInsert.map(c => (c.company || '').trim()).filter(m => !!m);
        
        // Relax strict start/end boundaries to handle existing spaces in DB
        const companyRegexes = companies.map(c => {
            const escaped = c.replace(/[-[\]{}()*+?.,\\\\^$|#\\s]/g, '\\\\$&');
            return new RegExp('^\\\\s*' + escaped + '\\\\s*$', 'i');
        });

        // Fetch all potential matches
        const existingCustomers = await Customer.find({
            $or: [
                { 'contactPersons.mobile': { $in: mobiles } },
                { company: { $in: companyRegexes } }
            ]
        });

        const finalInserts = [];
        const finalUpdates = [];

        customersToInsert.forEach(excelCustomer => {
            const primaryMobile = (excelCustomer.contactPersons[0].mobile || '').trim();
            const excelCompany = excelCustomer.company ? excelCustomer.company.trim().toLowerCase() : '';

            // Find match
            let matchedCustomer = null;
            if (excelCompany) {
                matchedCustomer = existingCustomers.find(c => c.company && c.company.trim().toLowerCase() === excelCompany);
            }
            if (!matchedCustomer && primaryMobile) {
                matchedCustomer = existingCustomers.find(c => c.contactPersons.some(cp => (cp.mobile || '').trim() === primaryMobile));
            }

            if (matchedCustomer) {
                // UPDATE RECORD
                // ⚠️ SAFETY: 'isDeleted' is intentionally excluded from fieldsToSync.
                // Customers must NEVER be soft-deleted via import.
                const fieldsToSync = ['customerName', 'company', 'address', 'city', 'state', 'pincode', 'gstNumber', 'gstRegistrationType', 'gstType', 'customerType', 'status'];
                
                let isUpdated = false;
                for (const field of fieldsToSync) {
                    if (excelCustomer[field] && String(excelCustomer[field]).trim() !== '') {
                        matchedCustomer[field] = excelCustomer[field];
                        isUpdated = true;
                    }
                }

                if (excelCustomer.interestedProducts && excelCustomer.interestedProducts.length > 0) {
                    matchedCustomer.interestedProducts = excelCustomer.interestedProducts;
                    isUpdated = true;
                }

                if (excelCustomer.contactPersons && excelCustomer.contactPersons[0]) {
                    const excelContact = excelCustomer.contactPersons[0];
                    if (matchedCustomer.contactPersons && matchedCustomer.contactPersons.length > 0) {
                        const dbPrimary = matchedCustomer.contactPersons.find(c => c.isPrimary) || matchedCustomer.contactPersons[0];
                        if (excelContact.mobile && !dbPrimary.mobile) dbPrimary.mobile = excelContact.mobile;
                        if (excelContact.email && !dbPrimary.email) dbPrimary.email = excelContact.email;
                        if (excelContact.name && !dbPrimary.name) dbPrimary.name = excelContact.name;
                        isUpdated = true;
                    }
                }

                if (isUpdated) {
                    finalUpdates.push(matchedCustomer);
                }
            } else {
                // NEW INSERT
                finalInserts.push(excelCustomer);
            }
        });

        // Insert valid ones
        if (finalInserts.length > 0) {
            await customerService.bulkCreateCustomers(finalInserts);
        }

        // Save updated ones
        if (finalUpdates.length > 0) {
            const uniqueUpdates = [...new Set(finalUpdates)];
            await Promise.all(uniqueUpdates.map(customer => customer.save()));
        }

        results.success = finalInserts.length + finalUpdates.length;
        // Optional: inform frontend exactly how many were inserted vs updated by attaching to results
        results.inserted = finalInserts.length;
        results.updated = finalUpdates.length;
    }


    res.send(new ApiResponse(200, results, 'Import completed'));
});

// Export Customers
const exportCustomers = catchAsync(async (req, res) => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer Master');

    worksheet.columns = [
        { header: 'Customer Code', key: 'customerCode', width: 15 },
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Business Type', key: 'customerType', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Primary Contact', key: 'primaryName', width: 20 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'Area/City', key: 'city', width: 20 },
        { header: 'District', key: 'district', width: 20 },
        { header: 'Taluka', key: 'taluka', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'Pincode', key: 'pincode', width: 15 },
        { header: 'Country', key: 'country', width: 15 },
        { header: 'GST NO', key: 'gstNumber', width: 20 },
        { header: 'GST Registration', key: 'gstRegistrationType', width: 20 },
        { header: 'GST Type', key: 'gstType', width: 15 },
        { header: 'Payment Type', key: 'paymentType', width: 15 },
        { header: 'Credit Period', key: 'creditPeriod', width: 15 },
        { header: 'Tags', key: 'tags', width: 25 },
        { header: 'Notes', key: 'notes', width: 40 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    const customers = await Customer.find({ isDeleted: { $ne: true } })
        .sort({ customerCode: 1, company: 1, customerName: 1 })
        .lean();

    customers.forEach((c) => {
        const primary = c.contactPersons?.find(cp => cp.isPrimary) || c.contactPersons?.[0] || {};
        worksheet.addRow({
            customerCode: c.customerCode || '',
            customerName: c.customerName || '',
            company: c.company || '',
            customerType: c.customerType || '',
            status: c.status ? c.status.replace('_', ' ').toUpperCase() : '',
            primaryName: primary.name || '',
            mobile: primary.mobile || '',
            email: c.companyEmail || primary.email || '',
            address: c.address || '',
            city: c.city || '',
            district: c.district || '',
            taluka: c.taluka || '',
            state: c.state || '',
            pincode: c.pincode || '',
            country: c.country || '',
            gstNumber: c.gstNumber || '',
            gstRegistrationType: c.gstRegistrationType || '',
            gstType: c.gstType || '',
            paymentType: c.paymentType || '',
            creditPeriod: c.creditPeriod || 0,
            tags: Array.isArray(c.tags) ? c.tags.join(', ') : '',
            notes: c.notes || ''
        });
    });

res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Customer_Master.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

// --- GST Bulk Update Feature ---

const previewGSTImport = catchAsync(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new ApiError(400, 'Excel file is empty');

    const headerRow = worksheet.getRow(1);
    let companyColMap = -1;
    let customerColMap = -1;
    let mobileColMap = -1;
    let gstColMap = -1;

    const findHeaders = (row) => {
        row.eachCell((cell, colNumber) => {
            const header = String(cell.value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (header.includes('company')) companyColMap = colNumber;
            else if ((header.includes('customer') || header === 'name' || header === 'customername') && customerColMap === -1) customerColMap = colNumber;
            else if ((header.includes('mobile') || header.includes('phone') || header.includes('contact')) && mobileColMap === -1) mobileColMap = colNumber;
            
            if (header.includes('gst')) gstColMap = colNumber;
        });
    };

    findHeaders(headerRow);

    const gstFormatRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    // Smart Detection if headers are missing or incomplete
    if (gstColMap === -1 || (companyColMap === -1 && customerColMap === -1 && mobileColMap === -1)) {
        const colStats = {}; // { colNumber: { gstCount: 0, textCount: 0 } }

        // Scan first 20 rows to detect columns by content
        for (let r = 1; r <= 20; r++) {
            const row = worksheet.getRow(r);
            if (!row) continue;
            row.eachCell((cell, colNumber) => {
                if (!colStats[colNumber]) colStats[colNumber] = { gstCount: 0, textCount: 0 };
                const rawVal = String(cell.value || '').trim();
                const cleanVal = rawVal.toUpperCase().replace(/\s+/g, '');
                
                if (gstFormatRegex.test(cleanVal)) {
                    colStats[colNumber].gstCount++;
                } else if (rawVal.length > 2) {
                    colStats[colNumber].textCount++;
                }
            });
        }

        // Pick column with most GSTs
        let maxGst = 0;
        for (const [col, stats] of Object.entries(colStats)) {
            if (stats.gstCount > maxGst) {
                maxGst = stats.gstCount;
                gstColMap = parseInt(col);
            }
        }

        // Pick identifier column (most non-GST text) if none found by header
        if (companyColMap === -1 && customerColMap === -1 && mobileColMap === -1) {
            let maxText = 0;
            for (const [col, stats] of Object.entries(colStats)) {
                const colNum = parseInt(col);
                if (colNum === gstColMap) continue;
                if (stats.textCount > maxText) {
                    maxText = stats.textCount;
                    companyColMap = colNum;
                }
            }
        }
    }

    console.log(`[GST Import] Detected Columns - Identifier: ${companyColMap}, GST: ${gstColMap}`);

    if (gstColMap === -1) {
        throw new ApiError(400, 'Could not detect the "GST" column. Please ensure your Excel has a column with valid GST numbers.');
    }
    if (companyColMap === -1 && customerColMap === -1 && mobileColMap === -1) {
        throw new ApiError(400, 'Could not detect the "Company" or "Name" column.');
    }

    const excelRows = [];
    const getCellText = (cell) => {
        if (!cell || cell.value === null || cell.value === undefined) return '';
        if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
        if (typeof cell.value === 'object' && cell.value.richText) return cell.value.richText.map(rt => rt.text).join('').trim();
        // Clean non-printable characters
        return String(cell.value).trim().replace(/[^\x20-\x7E\s]/g, '');
    };

    worksheet.eachRow((row, rowNumber) => {
        // Evaluate if row 1 is data or header
        if (rowNumber === 1) {
            const firstCell = getCellText(row.getCell(gstColMap)).toUpperCase().replace(/\s+/g, '');
            if (!gstFormatRegex.test(firstCell)) return; // It's probably a header row
        }

        const company = companyColMap !== -1 ? getCellText(row.getCell(companyColMap)).replace(/\s+/g, ' ').trim() : '';
        const customerName = customerColMap !== -1 ? getCellText(row.getCell(customerColMap)).replace(/\s+/g, ' ').trim() : '';
        const mobile = mobileColMap !== -1 ? getCellText(row.getCell(mobileColMap)).replace(/\s+/g, '').replace(/[^0-9]/g, '') : '';
        const gstNumber = getCellText(row.getCell(gstColMap)).replace(/\s+/g, '').toUpperCase();
        
        if (company || customerName || mobile) {
            excelRows.push({ rowNumber, company, customerName, mobile, gstNumber });
        }
    });

    // 1. Collect all terms for a single bulk query
    const searchCompanies = excelRows.map(r => r.company).filter(Boolean);
    const searchNames = excelRows.map(r => r.customerName).filter(Boolean);
    const searchMobiles = excelRows.map(r => r.mobile).filter(Boolean);

    const query = {
        isDeleted: { $ne: true },
        $or: []
    };

    if (searchCompanies.length > 0) {
        const companyRegexes = searchCompanies.map(c => {
            const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp('^\\s*' + escaped.replace(/ /g, '\\s+') + '\\s*$', 'i');
        });
        query.$or.push({ company: { $in: companyRegexes } });
    }

    if (searchNames.length > 0) {
        const nameRegexes = searchNames.map(c => {
            const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp('^\\s*' + escaped.replace(/ /g, '\\s+') + '\\s*$', 'i');
        });
        query.$or.push({ customerName: { $in: nameRegexes } });
    }

    if (searchMobiles.length > 0) {
        query.$or.push({ 'contactPersons.mobile': { $in: searchMobiles } });
    }

    const existingCustomers = await Customer.find(query).select('company customerName contactPersons gstNumber gstType gstRegistrationType status');

    const previews = [];

    excelRows.forEach(row => {
        const previewItem = {
            id: 'row_' + row.rowNumber,
            excelCompany: row.company || row.customerName || `Mobile: ${row.mobile}`,
            excelGst: row.gstNumber,
            matchedCustomerId: null,
            matchedCompany: null,
            existingGst: null,
            status: '',
            action: '',
            calculatedGstType: '',
            calculatedRegistration: ''
        };

        // Attempt to find match
        let matches = [];
        
        const excelIdentifier = (row.company || row.customerName).toLowerCase().replace(/\s+/g, ' ');

        if (excelIdentifier) {
            // Check both company and customerName for the identifier
            matches = existingCustomers.filter(c => {
                const dbCompany = (c.company || '').toLowerCase().replace(/\s+/g, ' ');
                const dbName = (c.customerName || '').toLowerCase().replace(/\s+/g, ' ');
                return (dbCompany && dbCompany === excelIdentifier) || (dbName && dbName === excelIdentifier);
            });
        }

        // Match by Mobile if still no match
        if (matches.length === 0 && row.mobile) {
            matches = existingCustomers.filter(c => 
                c.contactPersons && c.contactPersons.some(cp => cp.mobile && cp.mobile.replace(/[^0-9]/g, '') === row.mobile)
            );
        }

        if (matches.length === 0) {
            previewItem.status = 'Skip - Customer Not Found';
            previewItem.action = 'Skip';
        } else if (matches.length > 1) {
            previewItem.status = 'Skip - Multiple Matches in CRM';
            previewItem.action = 'Skip';
        } else {
            const dbCustomer = matches[0];
            previewItem.matchedCustomerId = dbCustomer._id;
            previewItem.matchedCompany = dbCustomer.company || dbCustomer.customerName;
            previewItem.existingGst = dbCustomer.gstNumber || '';

            if (row.gstNumber === '') {
                previewItem.status = 'Skip - Excel GST Empty';
                previewItem.action = 'Skip';
            } else if (!gstFormatRegex.test(row.gstNumber)) {
                previewItem.status = 'Skip - Invalid GST Format';
                previewItem.action = 'Skip';
            } else if (dbCustomer.gstNumber && dbCustomer.gstNumber.trim().length > 0) {
                previewItem.status = 'Skip - GST Already Exists in CRM';
                previewItem.action = 'Skip';
            } else {
                previewItem.status = 'Ready to Update';
                previewItem.action = 'Update';
                
                // Calculate resulting GST fields for preview
                previewItem.calculatedRegistration = 'Registered';
                const isMH = row.gstNumber.startsWith('27');
                previewItem.calculatedGstType = isMH ? 'CGST / SGST' : 'IGST';
            }
        }
        previews.push(previewItem);
    });

    res.send(new ApiResponse(200, { totalRows: excelRows.length, previews }, 'Preview generated successfully'));
});

const confirmGSTImport = catchAsync(async (req, res) => {
    const { previews, fileName } = req.body;
    
    if (!previews || !Array.isArray(previews)) {
        throw new ApiError(400, 'Invalid payload: No preview data');
    }

    const updates = [];
    const skipped = [];
    let updatedCount = 0;

    for (const item of previews) {
        if (item.action === 'Update' && item.matchedCustomerId) {
            const customer = await Customer.findById(item.matchedCustomerId);
            if (!customer) {
                skipped.push({ companyName: item.excelCompany, excelGst: item.excelGst, reason: 'Customer disappeared during confirm' });
                continue;
            }
            if (customer.gstNumber && customer.gstNumber.trim().length > 0) {
                skipped.push({ companyName: item.excelCompany, excelGst: item.excelGst, reason: 'GST was added to CRM by someone else before confirm' });
                continue;
            }

            const oldGst = customer.gstNumber || '';
            customer.gstNumber = item.excelGst;
            customer.gstRegistrationType = item.calculatedRegistration || 'Registered';
            customer.gstType = item.calculatedGstType || (item.excelGst.startsWith('27') ? 'CGST / SGST' : 'IGST');

            // 🛡️  Safety guard: never allow a GST import to change the isDeleted flag
            customer.isDeleted = false; // force-keep as active

            await customer.save();

            updates.push({
                customerId: customer._id,
                companyName: customer.company,
                oldGst: oldGst,
                newGst: item.excelGst
            });
            updatedCount++;
        } else {
            skipped.push({
                companyName: item.excelCompany,
                excelGst: item.excelGst,
                reason: item.status
            });
        }
    }

    // Save Audit Log
    const log = await GSTImportLog.create({
        fileName: fileName || 'Unknown File',
        importedBy: req.user._id,
        totalProcessed: previews.length,
        totalUpdated: updatedCount,
        updates: updates,
        skipped: skipped
    });

    res.send(new ApiResponse(200, { updatedCount, skippedCount: skipped.length, logId: log._id }, 'GST Numbers updated successfully'));
});

const restoreAllCustomers = catchAsync(async (req, res) => {
    const result = await Customer.updateMany(
        { isDeleted: true },
        { $set: { isDeleted: false, status: 'running_high' } }
    );
    res.send(new ApiResponse(200, result, `${result.modifiedCount} customers restored successfully`));
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
    exportCustomers,
    getCustomerTypes,
    getCustomerStickers,
    searchCustomers,
    previewGSTImport,
    confirmGSTImport,
    restoreAllCustomers,
    generateCustomerCode
};
