import httpStatus from 'http-status';
import { Shift } from '../models/shift.model.js';
import { Employee } from '../models/employee.model.js';
import { Holiday } from '../models/holiday.model.js';
import { Attendance } from '../models/attendance.model.js';
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

export const createEmployee = asyncHandler(async (req, res) => {
    // Check for unique employee code
    const existing = await Employee.findOne({ employeeCode: req.body.employeeCode });
    if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'Employee code already exists');

    const employee = await Employee.create({ ...req.body, createdBy: req.user._id });
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

    // Assuming first row is header. Columns: Employee Code, Date, Status, Check In, Check Out, Remarks
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        rowsToProcess.push({
            rowNumber,
            employeeCode: row.getCell(1).value?.toString()?.trim(),
            dateValue: row.getCell(2).value,
            status: row.getCell(3).value?.toString()?.trim() || 'Present',
            checkIn: row.getCell(4).value?.toString()?.trim() || '',
            checkOut: row.getCell(5).value?.toString()?.trim() || '',
            remarks: row.getCell(6).value?.toString()?.trim() || ''
        });
    });

    for (const data of rowsToProcess) {
        try {
            if (!data.employeeCode || !data.dateValue) continue;

            let parsedDate;
            if (data.dateValue instanceof Date) {
                parsedDate = data.dateValue;
            } else {
                parsedDate = new Date(data.dateValue);
            }

            // Find employee
            const employee = await Employee.findOne({ employeeCode: data.employeeCode });
            if (!employee) {
                errors.push(`Row ${data.rowNumber}: Employee code ${data.employeeCode} not found`);
                continue;
            }

            // Upsert record
            await Attendance.findOneAndUpdate(
                { employee: employee._id, date: parsedDate },
                { status: data.status, checkIn: data.checkIn, checkOut: data.checkOut, remarks: data.remarks },
                { upsert: true, new: true }
            );
            importedRecords.push(data.employeeCode);
        } catch (e) {
            errors.push(`Row ${data.rowNumber}: ${e.message}`);
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
