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
                parsedDate = new Date(data.dateValue);
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
    const { date, status } = req.query;
    const filter = {};
    
    if (date) {
        const queryDate = new Date(date);
        const startOfDay = new Date(queryDate.setHours(0,0,0,0));
        const endOfDay = new Date(queryDate.setHours(23,59,59,999));
        filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    
    if (status) {
        filter.status = status;
    }

    const attendance = await Attendance.find(filter)
        .populate('employee', 'employeeName employeeCode department')
        .sort({ date: -1 });
        
    res.send(new ApiResponse(httpStatus.OK, attendance));
});
