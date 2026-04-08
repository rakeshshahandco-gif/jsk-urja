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
import { HRSettings } from '../models/hrSettings.model.js';
import { SalaryWorking } from '../models/salaryWorking.model.js';


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

    const settings = await HRSettings.findOne() || await HRSettings.create({ updatedBy: req.user._id });

    const workbook = new ExcelJS.Workbook();
    if (req.file.originalname.toLowerCase().endsWith('.csv')) {
        const stream = Readable.from(req.file.buffer);
        await workbook.csv.read(stream);
    } else {
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
        else if (val === 'date') colMap.date = colNumber;
        else if (val.includes('status')) colMap.status = colNumber;
        else if (val.includes('intime') || val.includes('checkin') || val.includes('clockin')) colMap.inTime = colNumber;
        else if (val.includes('outtime') || val.includes('checkout') || val.includes('clockout')) colMap.outTime = colNumber;
        else if (val.includes('remark')) colMap.remarks = colNumber;
    });

    // Fallbacks
    if (!colMap.employeeName && !colMap.employeeCode) colMap.employeeName = 1;
    if (!colMap.date) colMap.date = 2;
    if (!colMap.inTime) colMap.inTime = 3;
    if (!colMap.outTime) colMap.outTime = 4;

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        rowsToProcess.push({
            rowNumber,
            employeeCode: colMap.employeeCode ? row.getCell(colMap.employeeCode).value?.toString()?.trim() : undefined,
            employeeName: colMap.employeeName ? row.getCell(colMap.employeeName).value?.toString()?.trim() : undefined,
            dateValue: colMap.date ? row.getCell(colMap.date).value : undefined,
            statusValue: colMap.status ? row.getCell(colMap.status).value?.toString()?.trim() : '',
            inTimeStr: colMap.inTime ? row.getCell(colMap.inTime).value?.toString()?.trim() : '',
            outTimeStr: colMap.outTime ? row.getCell(colMap.outTime).value?.toString()?.trim() : '',
            remarks: colMap.remarks ? row.getCell(colMap.remarks).value?.toString()?.trim() : ''
        });
    });

    for (const data of rowsToProcess) {
        try {
            if ((!data.employeeCode && !data.employeeName) || !data.dateValue) {
                if (!data.employeeCode && !data.employeeName && !data.dateValue) continue;
                if (!data.employeeCode && !data.employeeName) errors.push(`Row ${data.rowNumber}: Employee mapping missing`);
                if (!data.dateValue) errors.push(`Row ${data.rowNumber}: Date missing`);
                continue;
            }

            let parsedDate;
            if (data.dateValue instanceof Date) {
                parsedDate = moment.utc(data.dateValue).startOf('day').toDate();
            } else {
                parsedDate = moment.utc(data.dateValue, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'D-M-YYYY', 'YYYY/MM/DD']).startOf('day').toDate();
            }

            if (!moment(parsedDate).isValid()) {
                errors.push(`Row ${data.rowNumber}: Invalid date format (${data.dateValue})`);
                continue;
            }

            // [VALIDATION LOCKDOWN] Period Match Validation
            const pDate = moment.utc(parsedDate);
            if (month && year) {
                const targetM = parseInt(month);
                const targetY = parseInt(year);
                if (pDate.month() + 1 !== targetM || pDate.year() !== targetY) {
                    throw new ApiError(httpStatus.BAD_REQUEST, `Data Mismatch: Row ${data.rowNumber} contains date ${pDate.format('YYYY-MM-DD')}, but you selected ${moment().month(targetM-1).format('MMMM')} ${targetY}. Please upload the correct file.`);
                }
            }

            // Find employee
            let query = { isActive: true };
            if (data.employeeCode) {
                query.employeeCode = { $regex: new RegExp(`^${data.employeeCode}$`, 'i') };
            } else {
                query.employeeName = { $regex: new RegExp(`^${data.employeeName}$`, 'i') };
            }

            let employee = await Employee.findOne(query).populate('shiftType');
            if (!employee) {
                errors.push(`Row ${data.rowNumber}: Employee not found (${data.employeeCode || data.employeeName})`);
                continue;
            }

            // Logic Calculation
            let inTime = data.inTimeStr || '';
            let outTime = data.outTimeStr || '';
            let status = 'Present';
            let isMissingCheckout = false;
            let isLate = false;
            let lateMinutes = 0;
            let workingHours = 0;
            let isHalfDay = false;
            let inTimeActual = null;
            let outTimeActual = null;

            const parseTime = (timeStr, baseDate) => {
                if (!timeStr || timeStr.toLowerCase() === 'null' || timeStr === '') return null;
                let mTime = moment.utc(timeStr, ['HH:mm', 'HH:mm:ss', 'hh:mm A', 'hh:mm:ss A', 'h:mm A', 'H:mm']);
                if (!mTime.isValid()) return null;
                
                const result = moment.utc(baseDate);
                result.hour(mTime.hour());
                result.minute(mTime.minute());
                result.second(mTime.second());
                return result.toDate();
            };

            inTimeActual = parseTime(inTime, parsedDate);
            outTimeActual = parseTime(outTime, parsedDate);

            // 1. Present/Absent Logic (Rule 2)
            if (!inTime && !outTime) {
                status = 'Absent';
            } else {
                status = 'Present';
                // 2. Missing Checkout Logic (Rule 4)
                if (inTime && !outTime) {
                    isMissingCheckout = true;
                    if (settings.missingCheckoutHandling === 'Mark as Absent') {
                        status = 'Absent';
                    }
                }

                // 3. Late Coming Logic (Rule 5)
                const shift = employee.shiftType || { startTime: settings.officeStartTime, graceMinutes: settings.graceMinutes };
                const shiftStartStr = shift.startTime || settings.officeStartTime || '10:00';
                const grace = shift.graceMinutes !== undefined ? shift.graceMinutes : settings.graceMinutes;
                
                if (inTimeActual) {
                    const [sh, sm] = shiftStartStr.split(':');
                    const shiftStart = moment.utc(parsedDate).hour(parseInt(sh)).minute(parseInt(sm)).second(0);
                    const diff = moment(inTimeActual).diff(shiftStart, 'minutes');
                    if (diff > grace) {
                        isLate = true;
                        lateMinutes = diff;
                    }
                }

                // 4. Working Hours & Half Day Logic (Rule 3)
                if (inTimeActual && outTimeActual) {
                    workingHours = moment(outTimeActual).diff(moment(inTimeActual), 'hours', true);
                    if (workingHours < 0) workingHours += 24; // Handle night shifts briefly
                    
                    const halfDayThreshold = shift.halfDayMinHours || settings.halfDayThresholdHours || 4;
                    if (workingHours < halfDayThreshold) {
                        isHalfDay = true;
                        status = 'Half Day';
                    }
                }
            }

            // Override with manual status if provided
            if (data.statusValue && ['Present', 'Absent', 'Half Day', 'Late', 'Holiday', 'Leave'].includes(data.statusValue)) {
                status = data.statusValue;
            }

            const isSunday = moment(parsedDate).day() === 0;

            await Attendance.findOneAndUpdate(
                { employee: employee._id, date: parsedDate },
                { 
                    status, 
                    checkIn: inTime, 
                    checkOut: outTime, 
                    inTime,
                    outTime,
                    inTimeActual,
                    outTimeActual,
                    workingHours,
                    isLate,
                    lateMinutes,
                    isHalfDay,
                    isMissingCheckout,
                    isSunday,
                    remarks: data.remarks 
                },
                { upsert: true, new: true }
            );
            importedRecords.push(employee.employeeName);
        } catch (e) {
            errors.push(`Row ${data.rowNumber}: ${e.message}`);
        }
    }

    res.send(new ApiResponse(httpStatus.OK, { imported: importedRecords.length, errors }, 'Attendance data processed successfully'));
});



export const getAttendances = asyncHandler(async (req, res) => {
    const { date, status, month, year, financialYear, view } = req.query;
    res.setHeader('X-Permanent-Fix', 'True');
    console.log(`[Attendance API] LOCKEDDOWN REQ: month=${month}, year=${year}, FY=${financialYear}, view=${view}`);
    let filter = {};
    
    // If month and year are provided, decide between simple list or full report
    const m = Number(Array.isArray(month) ? month[0] : month);
    const y = Number(Array.isArray(year) ? year[0] : year);
    
    if (month && year && !isNaN(m) && !isNaN(y)) {
        if (view === 'report') {
            console.log(`[Attendance API] GENERATING FULL REPORT GRID for ${y}-${m}`);
            // --- FULL REPORT GRID LOGIC ---
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
    } else {
            console.log(`[Attendance API] FETCHING SIMPLE LIST for ${y}-${m}`);
            const startDate = moment.utc({ year: y, month: m - 1, day: 1 }).startOf('month');
            const endDate = moment.utc({ year: y, month: m - 1, day: 1 }).endOf('month');
            
            filter.date = { $gte: startDate.toDate(), $lte: endDate.toDate() };
            if (status) filter.status = status;

            const attendance = await Attendance.find(filter)
                .populate('employee', 'employeeName employeeCode department')
                .sort({ date: -1 });

            return res.send(new ApiResponse(httpStatus.OK, attendance));
        }
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

// --- HR SETTINGS CONTROLLERS ---

export const getHRSettings = asyncHandler(async (req, res) => {
    let settings = await HRSettings.findOne();
    if (!settings) {
        settings = await HRSettings.create({ updatedBy: req.user._id });
    }
    res.send(new ApiResponse(httpStatus.OK, settings));
});

export const updateHRSettings = asyncHandler(async (req, res) => {
    let settings = await HRSettings.findOne();
    if (settings) {
        settings = await HRSettings.findByIdAndUpdate(settings._id, { ...req.body, updatedBy: req.user._id }, { new: true });
    } else {
        settings = await HRSettings.create({ ...req.body, updatedBy: req.user._id });
    }
    res.send(new ApiResponse(httpStatus.OK, settings, 'HR Settings updated successfully'));
});

// --- REPORT CONTROLLERS ---

export const getDailyAttendanceReport = asyncHandler(async (req, res) => {
    const { date, department, employee } = req.query;
    
    const reportDate = date ? moment.utc(date).startOf('day') : moment.utc().startOf('day');
    const start = reportDate.toDate();
    const end = moment.utc(reportDate).endOf('day').toDate();

    const empFilter = { isActive: true };
    if (department) empFilter.department = department;
    if (employee) empFilter._id = employee;

    const employees = await Employee.find(empFilter).populate('department', 'name');
    const records = await Attendance.find({
        date: { $gte: start, $lte: end }
    });

    const report = employees.map(emp => {
        const rec = records.find(r => r.employee.toString() === emp._id.toString());
        if (rec) return rec;
        
        // If no record, it's Absent (unless it's Sunday/Holiday, but Daily Report usually shows status as is)
        return {
            _id: `absent-${emp._id}`,
            employee: emp,
            date: start,
            status: 'Absent',
            inTime: '',
            outTime: '',
            workingHours: 0,
            isLate: false,
            isHalfDay: false,
            isMissingCheckout: false
        };
    });

    res.send(new ApiResponse(httpStatus.OK, report));
});



export const getMonthlySummaryReport = asyncHandler(async (req, res) => {
    const { month, year, employee, department } = req.query;
    if (!month || !year) throw new ApiError(httpStatus.BAD_REQUEST, 'Month and Year are required');

    const mInt = parseInt(month);
    const yInt = parseInt(year);
    const startDate = moment.utc({ year: yInt, month: mInt - 1, day: 1 }).startOf('day');
    const endDate = moment.utc(startDate).endOf('month');
    const daysInMonth = startDate.daysInMonth();

    const empFilter = { isActive: true };
    if (employee) empFilter._id = employee;
    if (department) empFilter.department = department;

    const employees = await Employee.find(empFilter).populate('department', 'name');
    const records = await Attendance.find({
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() }
    });

    const settings = await HRSettings.findOne() || {};
    const holidays = await Holiday.find({
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        isActive: true
    });

    const holidayMap = {};
    holidays.forEach(h => holidayMap[moment.utc(h.date).format('YYYY-MM-DD')] = h.name);

    const summary = employees.map(emp => {
        const empRecords = records.filter(r => r.employee.toString() === emp._id.toString());
        
        const counts = {
            present: 0,
            absent: 0,
            halfDay: 0,
            late: 0,
            missingCheckout: 0,
            sundays: 0,
            holidays: 0,
        };

        for (let d = 1; d <= daysInMonth; d++) {
            const currDate = moment.utc(startDate).date(d);
            const dateKey = currDate.format('YYYY-MM-DD');
            const isSun = currDate.day() === 0;
            const isHol = holidayMap[dateKey];
            
            const rec = empRecords.find(r => moment.utc(r.date).format('YYYY-MM-DD') === dateKey);

            if (rec && rec.status !== 'Absent') {
                if (rec.status === 'Present') counts.present++;
                else if (rec.status === 'Half Day') counts.halfDay++;
                
                if (rec.isLate) counts.late++;
                if (rec.isMissingCheckout) counts.missingCheckout++;
            } else {
                // If record is Absent OR no record, check if it's Sunday or Holiday for paid status
                if (isSun) counts.sundays++;
                else if (isHol) counts.holidays++;
                else counts.absent++;
            }
        }

        const paidHolidays = settings.isHolidayPaid ? counts.holidays : 0;
        const paidSundays = settings.isSundayPaid ? counts.sundays : 0;
        // Formula: Present + HalfDay(0.5) + Paid Non-Working (Sun + Hol)
        const totalPayableDays = counts.present + (counts.halfDay * 0.5) + paidHolidays + paidSundays;

        return {
            employee: emp,
            employeeName: emp.employeeName,
            employeeCode: emp.employeeCode,
            departmentName: emp.department?.name || 'N/A',
            month: `${moment.months(mInt - 1)} ${yInt}`,
            totalDays: daysInMonth,
            present: counts.present,
            absent: counts.absent,
            halfDay: counts.halfDay,
            late: counts.late,
            missingCheckout: counts.missingCheckout,
            sundays: counts.sundays,
            holidays: counts.holidays,
            paidNonWorkingDays: counts.sundays + counts.holidays,
            totalPayableDays,
            salaryWorkingDays: totalPayableDays
        };
    });

    res.send(new ApiResponse(httpStatus.OK, summary));
});


export const getLateComingReport = asyncHandler(async (req, res) => {
    const { month, year, employee, department } = req.query;
    
    const filter = { isLate: true };
    if (month && year) {
        const start = moment.utc({ year: parseInt(year), month: parseInt(month) - 1, day: 1 }).startOf('day').toDate();
        const end = moment.utc(start).endOf('month').toDate();
        filter.date = { $gte: start, $lte: end };
    }

    if (employee) filter.employee = employee;

    let report = await Attendance.find(filter)
        .populate({
            path: 'employee',
            match: department ? { department } : {},
            populate: { path: 'shiftType' }
        })
        .sort({ date: -1 });

    report = report.filter(r => r.employee);

    const results = report.map(r => ({
        employeeName: r.employee.employeeName,
        employeeCode: r.employee.employeeCode,
        date: r.date,
        inTime: r.inTime,
        shiftTime: r.employee.shiftType?.startTime || '10:00',
        graceTime: r.employee.shiftType?.graceMinutes || 10,
        delayMinutes: r.lateMinutes,
        status: 'Late'
    }));

    res.send(new ApiResponse(httpStatus.OK, results));
});


export const getMissingPunchReport = asyncHandler(async (req, res) => {
    const { month, year, employee, department } = req.query;
    const filter = { isMissingCheckout: true };

    if (month && year) {
        const start = moment.utc({ year: parseInt(year), month: parseInt(month) - 1, day: 1 }).startOf('day').toDate();
        const end = moment.utc(start).endOf('month').toDate();
        filter.date = { $gte: start, $lte: end };
    }

    if (employee) filter.employee = employee;

    let report = await Attendance.find(filter)
        .populate({
            path: 'employee',
            match: department ? { department } : {},
            populate: { path: 'department', select: 'name' }
        })
        .sort({ date: -1 });

    report = report.filter(r => r.employee);

    res.send(new ApiResponse(httpStatus.OK, report));
});


export const getSalaryWorkingReport = asyncHandler(async (req, res) => {
    const { month, year, employee, department } = req.query;
    if (!month || !year) throw new ApiError(httpStatus.BAD_REQUEST, 'Month and Year are required');

    const mInt = parseInt(month);
    const yInt = parseInt(year);
    const startDate = moment.utc({ year: yInt, month: mInt - 1, day: 1 }).startOf('day');
    const endDate = moment.utc(startDate).endOf('month');
    const daysInMonth = startDate.daysInMonth();

    const empFilter = { isActive: true };
    if (employee) empFilter._id = employee;
    if (department) empFilter.department = department;

    const employees = await Employee.find(empFilter).populate('department', 'name');
    const records = await Attendance.find({
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() }
    });

    const settings = await HRSettings.findOne() || {};
    const holidays = await Holiday.find({
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        isActive: true
    });

    const holidayMap = {};
    holidays.forEach(h => holidayMap[moment.utc(h.date).format('YYYY-MM-DD')] = h.name);

    const salaryData = employees.map(emp => {
        const empRecords = records.filter(r => r.employee.toString() === emp._id.toString());
        
        let present = 0;
        let halfDay = 0;
        let absent = 0;
        let sundays = 0;
        let monthHolidays = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const currDate = moment.utc(startDate).date(d);
            const dateKey = currDate.format('YYYY-MM-DD');
            const isSun = currDate.day() === 0;
            const isHol = holidayMap[dateKey];

            const rec = empRecords.find(r => moment.utc(r.date).format('YYYY-MM-DD') === dateKey);

            if (rec && rec.status !== 'Absent') {
                if (rec.status === 'Present') present++;
                else if (rec.status === 'Half Day') halfDay++;
            } else {
                if (isSun) sundays++;
                else if (isHol) monthHolidays++;
                else absent++;
            }
        }

        const paidHolidays = settings.isHolidayPaid ? monthHolidays : 0;
        const paidSundays = settings.isSundayPaid ? sundays : 0;
        const totalPayable = present + (halfDay * 0.5) + paidHolidays + paidSundays;

        return {
            employee: emp.employeeName,
            employeeCode: emp.employeeCode,
            department: emp.department?.name || 'N/A',
            month: `${moment.months(mInt - 1)} ${yInt}`,
            totalDays: daysInMonth,
            present,
            halfDay,
            absent,
            sundays,
            holidays: monthHolidays,
            totalPayableDays: totalPayable,
            salaryWorkingBasis: `Present(${present}) + HalfDay(${halfDay}*0.5) + Sun(${paidSundays}) + Hol(${paidHolidays})`
        };
    });

    res.send(new ApiResponse(httpStatus.OK, salaryData));
});


export const downloadAttendanceTemplate = asyncHandler(async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Upload Template');

    worksheet.columns = [
        { header: 'Employee Name', key: 'name', width: 25 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'In Time', key: 'inTime', width: 15 },
        { header: 'Out Time', key: 'outTime', width: 15 },
    ];

    // Add sample row
    worksheet.addRow({
        name: 'John Doe',
        date: moment().format('DD-MM-YYYY'),
        inTime: '10:00 AM',
        outTime: '06:00 PM'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
});

export const bulkDeleteAttendance = asyncHandler(async (req, res) => {
    const { month, year } = req.body;
    if (!month || !year) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Month and Year are required');
    }

    const m = parseInt(month);
    const y = parseInt(year);
    // [TZ LOCKDOWN] Expand range by 6 hours to capture records shifted by IST (+5:30)
    const startOfMonth = moment.utc({ year: y, month: m - 1, day: 1 }).subtract(6, 'hours');
    const endOfMonth = moment.utc({ year: y, month: m - 1, day: 1 }).endOf('month').add(6, 'hours');

    // Delete attendance records
    const attResult = await Attendance.deleteMany({
        date: { $gte: startOfMonth.toDate(), $lte: endOfMonth.toDate() }
    });

    // Delete salary working records to force regenerate
    const swResult = await SalaryWorking.deleteMany({ month: m, year: y });

    res.send(new ApiResponse(httpStatus.OK, {
        attendanceDeleted: attResult.deletedCount,
        salaryWorkingDeleted: swResult.deletedCount
    }, `Successfully cleared data for ${moment.months(m - 1)} ${y}`));
});


