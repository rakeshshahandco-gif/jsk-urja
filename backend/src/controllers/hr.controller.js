import httpStatus from 'http-status';
import { Shift } from '../models/shift.model.js';
import { Employee } from '../models/employee.model.js';
import { Holiday } from '../models/holiday.model.js';
import { Attendance } from '../models/attendance.model.js';
import { Department } from '../models/department.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import moment from 'moment';
import { FinancialYear } from '../models/financialYear.model.js';

// --- SHIFT CONTROLLERS ---

export const createShift = asyncHandler(async (req, res) => {
    const shift = await Shift.create({ ...req.body, createdBy: req.user._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, shift, 'Shift created successfully'));
});

export const getShifts = asyncHandler(async (req, res) => {
    const shifts = await Shift.find({ isActive: true });
    res.send(new ApiResponse(httpStatus.OK, shifts));
});

export const updateShift = asyncHandler(async (req, res) => {
    const shift = await Shift.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!shift) throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
    res.send(new ApiResponse(httpStatus.OK, shift, 'Shift updated successfully'));
});

export const deleteShift = asyncHandler(async (req, res) => {
    const shift = await Shift.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!shift) throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'Shift deleted successfully'));
});

// --- EMPLOYEE CONTROLLERS ---

export const generateNextEmployeeCodeInternal = async () => {
    const lastEmployee = await Employee.findOne(
        { employeeCode: { $regex: /^EMP\d+$/i } },
        { employeeCode: 1 }
    ).sort({ createdAt: -1 });

    let nextNum = 1;
    if (lastEmployee && lastEmployee.employeeCode) {
        const numPart = parseInt(lastEmployee.employeeCode.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numPart)) nextNum = numPart + 1;
    }

    let isUnique = false;
    let newCode;
    while (!isUnique) {
        newCode = `EMP${String(nextNum).padStart(3, '0')}`;
        const exists = await Employee.exists({ employeeCode: new RegExp(`^${newCode}$`, 'i') });
        if (!exists) isUnique = true;
        else nextNum++;
    }
    return newCode;
};

export const generateEmployeeCode = asyncHandler(async (req, res) => {
    const newCode = await generateNextEmployeeCodeInternal();
    res.send(new ApiResponse(httpStatus.OK, { employeeCode: newCode }, 'Code generated'));
});

export const createEmployee = asyncHandler(async (req, res) => {
    const body = { ...req.body };
    
    // Auto-generate employee code if missing
    if (!body.employeeCode || String(body.employeeCode).trim() === '') {
        body.employeeCode = await generateNextEmployeeCodeInternal();
    } else {
        body.employeeCode = String(body.employeeCode).trim().toUpperCase();
    }

    // Check for unique employee code
    const existing = await Employee.findOne({ employeeCode: body.employeeCode });
    if (existing) throw new ApiError(httpStatus.BAD_REQUEST, `Employee code ${body.employeeCode} already exists`);

    const employee = await Employee.create({ ...body, createdBy: req.user._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, employee, 'Employee created successfully'));
});

export const getEmployees = asyncHandler(async (req, res) => {
    const filters = { isActive: true };
    if (req.query.status) filters.employmentStatus = req.query.status;
    if (req.query.department) filters.department = req.query.department;

    const employees = await Employee.find(filters)
        .populate('department', 'name')
        .populate('reportingManager', 'name')
        .populate('shiftType', 'name')
        .sort({ employeeCode: 1 });
    res.send(new ApiResponse(httpStatus.OK, employees));
});

export const getEmployee = asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id)
        .populate('department', 'name')
        .populate('reportingManager', 'name email mobile')
        .populate('shiftType')
        .populate('userId', 'username email isActive');
    if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
    res.send(new ApiResponse(httpStatus.OK, employee));
});

export const updateEmployee = asyncHandler(async (req, res) => {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true })
        .populate('department', 'name')
        .populate('shiftType', 'name');
    if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
    res.send(new ApiResponse(httpStatus.OK, employee, 'Employee updated successfully'));
});

export const deleteEmployee = asyncHandler(async (req, res) => {
    // We don't delete, we just mark inactive as per requirements
    const employee = await Employee.findByIdAndUpdate(req.params.id, { employmentStatus: 'Terminated', isActive: false }, { new: true });
    if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'Employee record deactivated'));
});

// --- HOLIDAY CONTROLLERS ---

export const createHoliday = asyncHandler(async (req, res) => {
    const holiday = await Holiday.create({ ...req.body, createdBy: req.user._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, holiday, 'Holiday added to list'));
});

export const getHolidays = asyncHandler(async (req, res) => {
    const { year } = req.query;
    const filter = { isActive: true };
    
    if (year) {
        const start = new Date(`${year}-01-01`);
        const end = new Date(`${year}-12-31`);
        filter.date = { $gte: start, $lte: end };
    }

    const holidays = await Holiday.find(filter).sort({ date: 1 });
    res.send(new ApiResponse(httpStatus.OK, holidays));
});

export const updateHoliday = asyncHandler(async (req, res) => {
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!holiday) throw new ApiError(httpStatus.NOT_FOUND, 'Holiday record not found');
    res.send(new ApiResponse(httpStatus.OK, holiday, 'Holiday updated successfully'));
});

export const deleteHoliday = asyncHandler(async (req, res) => {
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!holiday) throw new ApiError(httpStatus.NOT_FOUND, 'Holiday record not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'Holiday removed from active list'));
});

// --- ATTENDANCE CONTROLLERS ---

export const importAttendance = asyncHandler(async (req, res) => {
    const { month, year } = req.body;
    
    if (!req.file) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an excel or csv file');
    }

    const workbook = new ExcelJS.Workbook();
    
    if (req.file.originalname.toLowerCase().endsWith('.csv')) {
        // Read CSV from buffer by wrapping it in a stream
        const stream = Readable.from(req.file.buffer);
        await workbook.csv.read(stream);
    } else {
        // Read Excel from buffer
        await workbook.xlsx.load(req.file.buffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No worksheet found in document');
    }

    const importedRecords = [];
    const errors = [];
    const rowsToProcess = [];

    // Dynamically find columns
    const headerRow = worksheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().trim().toLowerCase().replace(/\s+/g, '') || '';
        if (val.includes('employeecode') || val.includes('employeeid') || val === 'code' || val === 'empcode' || val === 'empid') colMap.employeeCode = colNumber;
        else if (val.includes('employeename') || val === 'name' || val === 'empname' || val === 'employee') colMap.employeeName = colNumber;
        else if (val.includes('date')) colMap.date = colNumber;
        else if (val.includes('status')) colMap.status = colNumber;
        else if (val.includes('checkin') || val.includes('clockin') || val.includes('intime')) colMap.checkIn = colNumber;
        else if (val.includes('checkout') || val.includes('clockout') || val.includes('outtime')) colMap.checkOut = colNumber;
        else if (val.includes('remark')) colMap.remarks = colNumber;
    });

    // Default fallbacks if no clear headers found
    if (!colMap.employeeCode && !colMap.employeeName) colMap.employeeName = 1;
    if (!colMap.date) colMap.date = 2;

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        rowsToProcess.push({
            rowNumber,
            employeeCode: colMap.employeeCode ? row.getCell(colMap.employeeCode).value?.toString()?.trim() : undefined,
            employeeName: colMap.employeeName ? row.getCell(colMap.employeeName).value?.toString()?.trim() : undefined,
            dateValue: colMap.date ? row.getCell(colMap.date).value : undefined,
            status: colMap.status ? row.getCell(colMap.status).value?.toString()?.trim() : 'Present',
            checkIn: colMap.checkIn ? row.getCell(colMap.checkIn).value?.toString()?.trim() : '',
            checkOut: colMap.checkOut ? row.getCell(colMap.checkOut).value?.toString()?.trim() : '',
            remarks: colMap.remarks ? row.getCell(colMap.remarks).value?.toString()?.trim() : ''
        });
    });

    for (const data of rowsToProcess) {
        try {
            if ((!data.employeeCode && !data.employeeName) || !data.dateValue) {
                if (!data.employeeCode && !data.employeeName && !data.dateValue) continue; // skip entirely empty rows
                if (!data.employeeCode && !data.employeeName) errors.push(`Row ${data.rowNumber}: Employee Code or Name missing`);
                if (!data.dateValue) errors.push(`Row ${data.rowNumber}: Date missing`);
                continue;
            }

            let parsedDate;
            if (data.dateValue instanceof Date) {
                parsedDate = data.dateValue;
            } else {
                // If the user provided a month/year context, try to force the date into that period
                if (month && year && typeof data.dateValue === 'string') {
                    const dayPart = data.dateValue.split(/[-\/]/)[0]; // Assume first part is day if simple
                    const day = parseInt(dayPart);
                    if (!isNaN(day) && day >= 1 && day <= 31) {
                        parsedDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, day));
                    } else {
                        parsedDate = new Date(data.dateValue);
                    }
                } else {
                    parsedDate = new Date(data.dateValue);
                }
            }
            
            // Final validation: if we have month/year context, ensure the date belongs to it
            if (month && year && !isNaN(parsedDate)) {
                parsedDate.setUTCFullYear(parseInt(year));
                parsedDate.setUTCMonth(parseInt(month) - 1);
            }

            // Find employee
            let query = {};
            if (data.employeeCode) {
                query.employeeCode = { $regex: new RegExp(`^${data.employeeCode}$`, 'i') };
            } else if (data.employeeName) {
                query.employeeName = { $regex: new RegExp(`^${data.employeeName}$`, 'i') };
            }

            let employee = await Employee.findOne(query);
            
            if (!employee) {
                if (!data.employeeName) {
                    errors.push(`Row ${data.rowNumber}: Employee Name missing, cannot auto-create`);
                    continue;
                }
                
                // Get or create dummy department
                let dept = await Department.findOne({ name: 'Imported Staff' });
                if (!dept) dept = await Department.create({ name: 'Imported Staff', isActive: true, createdBy: req.user._id });
                
                // Get or create dummy shift
                let shift = await Shift.findOne({ name: 'Imported Shift' });
                if (!shift) shift = await Shift.create({ name: 'Imported Shift', startTime: '09:00', endTime: '18:00', duration: 9, isActive: true, createdBy: req.user._id });
                
                // Generate new code
                let newCode = data.employeeCode;
                if (!newCode) {
                    newCode = await generateNextEmployeeCodeInternal(); 
                }

                employee = await Employee.create({
                    employeeCode: newCode,
                    employeeName: data.employeeName,
                    department: dept._id,
                    designation: 'Staff',
                    branch: 'Main Location',
                    mobileNumber: '0000000000',
                    dateOfJoining: new Date(),
                    shiftType: shift._id,
                    remarks: 'Auto-created from Attendance Import',
                    createdBy: req.user._id
                });
            }

            // Upsert record
            await Attendance.findOneAndUpdate(
                { employee: employee._id, date: parsedDate },
                { status: data.status, checkIn: data.checkIn, checkOut: data.checkOut, remarks: data.remarks },
                { upsert: true, new: true }
            );
            importedRecords.push(data.employeeCode || data.employeeName);
        } catch (e) {
            // Trigger nodemon restart comment
            errors.push(`Row ${data.rowNumber}: Server Error - ${e.message}`);
        }
    }

    res.send(new ApiResponse(httpStatus.OK, { imported: importedRecords.length, errors }, 'Attendance data processed successfully'));
});

export const getAttendances = asyncHandler(async (req, res) => {
    const { date, status, month, year, financialYear } = req.query;
    res.setHeader('X-Permanent-Fix', 'True');
    console.log(`[Attendance API] LOCKEDDOWN REQ: month=${month}, year=${year}, FY=${financialYear}`);
    let filter = {};
    
    // If month and year are provided, we generate a FULL REPORT for the month
    const m = Number(Array.isArray(month) ? month[0] : month);
    const y = Number(Array.isArray(year) ? year[0] : year);
    if (month && year && !isNaN(m) && !isNaN(y)) {
        // 0. Financial Year Validation (Optional but recommended)
        if (financialYear) {
            const fy = await FinancialYear.findOne({ name: financialYear });
            if (fy) {
                // Use object constructor for maximum safety
                const requestedDate = moment.utc({ year: y, month: m - 1, day: 1 });
                const fyStart = moment.utc(fy.startDate).startOf('day');
                const fyEnd = moment.utc(fy.endDate).endOf('day');
                
                if (requestedDate.isBefore(fyStart) || requestedDate.isAfter(fyEnd)) {
                    console.log(`[Attendance API] Period ${y}-${m} is OUTSIDE FY ${financialYear}`);
                    return res.send(new ApiResponse(httpStatus.OK, [], `Selected month/year is outside Financial Year ${financialYear}`));
                }
            }
        }

        // 1. Calculate Strict UTC boundaries using object notation
        const startDate = moment.utc({ year: y, month: m - 1, day: 1 }).startOf('month');
        const endDate = moment.utc({ year: y, month: m - 1, day: 1 }).endOf('month');
        
        if (!startDate.isValid() || !endDate.isValid()) {
            console.warn(`[Attendance API] Invalid date computation for m=${m}, y=${y}`);
            return res.send(new ApiResponse(httpStatus.OK, [], 'Invalid date parameters'));
        }

        console.log(`[Attendance API] FETCHING STRICT RANGE: ${startDate.toISOString()} - ${endDate.toISOString()}`);
        
        // 2. Fetch active employees
        const employees = await Employee.find({ isActive: true }).populate('department', 'name').sort({ employeeName: 1 });
        
        // 3. Fetch ACTUAL records for the range (standard query for compatibility)
        let actualRecords = await Attendance.find({
            date: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        }).populate('employee', 'employeeName employeeCode department');

        // [LOGIC LOCKDOWN] Ensure absolute year/month alignment (compensates for TZ shifts)
        actualRecords = actualRecords.filter(rec => {
            const rd = moment.utc(rec.date).add(5.5, 'hours'); // IST Correction
            return rd.year() === y && (rd.month() + 1) === m;
        });

        console.log(`[Attendance API] Found ${actualRecords.length} records after Logic Lockdown.`);
        res.setHeader('X-Lockdown-Applied', 'v3');
        
        // 4. Fetch holidays for this month
        const holidays = await Holiday.find({
            date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
            isActive: true
        });

        // 5. Mapping
        const attendanceMap = {};
        actualRecords.forEach(rec => {
            const empId = rec.employee?._id?.toString();
            if (!empId) return;
            
            // CRITICAL SAFETY CHECK: Ensure the actual record date matches the requested month/year
            const recordMoment = moment.utc(rec.date);
            if (recordMoment.year() !== y || (recordMoment.month() + 1) !== m) {
                console.warn(`[Attendance API] LEAKAGE PREVENTED: Skipping record from ${recordMoment.format('YYYY-MM-DD')} for ${y}-${m} query`);
                return;
            }

            const dateKey = recordMoment.format('YYYY-MM-DD');
            if (!attendanceMap[empId]) attendanceMap[empId] = {};
            attendanceMap[empId][dateKey] = rec;
        });

        const holidayMap = {};
        holidays.forEach(h => {
            const dateKey = moment.utc(h.date).format('YYYY-MM-DD');
            holidayMap[dateKey] = h.name;
        });

        // 6. Generate the FULL REPORT GRID
        const report = [];
        const daysInMonth = startDate.daysInMonth();
        
        for (let d = 1; d <= daysInMonth; d++) {
            const currentDate = moment.utc({ year: y, month: m - 1, day: d });
            const dateKey = currentDate.format('YYYY-MM-DD');
            const isSunday = currentDate.day() === 0;
            const holidayName = holidayMap[dateKey];

            for (const emp of employees) {
                const empId = emp._id.toString();
                const existing = attendanceMap[empId]?.[dateKey];

                if (existing) {
                    // Rule: If it's a Sunday, but we have an 'Absent' record, we might want to override to 'Holiday'
                    // as per "Sunday = Present" logic. But let's keep the actual record if it exists, UNLESS it's specifically absent.
                    if (isSunday && existing.status === 'Absent') {
                        existing.status = 'Holiday';
                        existing.remarks = 'Weekly Off (Sunday)';
                    }
                    report.push(existing);
                } else if (isSunday || holidayName) {
                    // Virtual "Holiday" record
                    report.push({
                        _id: `v-${empId}-${dateKey}`,
                        employee: emp,
                        date: currentDate.toDate(),
                        status: 'Holiday',
                        checkIn: '',
                        checkOut: '',
                        remarks: holidayName || 'Weekly Off (Sunday)'
                    });
                } else {
                    // Virtual "Absent" record
                    report.push({
                        _id: `v-${empId}-${dateKey}`,
                        employee: emp,
                        date: currentDate.toDate(),
                        status: 'Absent',
                        checkIn: '',
                        checkOut: '',
                        remarks: 'No record found'
                    });
                }
            }
        }

        let filteredReport = report;
        if (status) {
            const statusFilter = Array.isArray(status) ? status[0] : status;
            filteredReport = report.filter(r => r.status === statusFilter);
        }

        // 7. FINAL LOGICAL LOCKDOWN: Filter out ANY record that somehow got through
        filteredReport = filteredReport.filter(r => {
            const rd = moment.utc(r.date).add(5.5, 'hours'); // Correct to IST for logic check
            return rd.year() === y && (rd.month() + 1) === m;
        });

        // Sort: Latest date first for the display
        return res.send(new ApiResponse(httpStatus.OK, filteredReport.sort((a,b) => new Date(b.date) - new Date(a.date)), 'Report generated', { debug: { m, y, actualCount: actualRecords.length, daysInMonth } }));
    }

    // Default legacy behavior for single date or overall view
    if (date) {
        const dateVal = Array.isArray(date) ? date[0] : date;
        const queryDate = new Date(dateVal);
        const startOfDay = new Date(queryDate.setHours(0,0,0,0));
        const endOfDay = new Date(queryDate.setHours(23,59,59,999));
        filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    
    if (status) {
        filter.status = status;
    }

    // Default: if no filters, at least cap to a reasonable range or return empty 
    // to prevent showing future junk or massive data dumps
    if (!filter.date && !filter.status && !filter.employee) {
        // Return empty or filter to current month if no parameters given
        const start = moment().startOf('month').toDate();
        const end = moment().endOf('month').toDate();
        filter.date = { $gte: start, $lte: end };
    }

    const attendance = await Attendance.find(filter)
        .populate('employee', 'employeeName employeeCode department')
        .sort({ date: -1 })
        .limit(100);
        
    res.send(new ApiResponse(httpStatus.OK, attendance));
});
