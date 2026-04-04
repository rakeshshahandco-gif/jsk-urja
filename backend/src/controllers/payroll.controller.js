import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { SalaryWorking } from '../models/salaryWorking.model.js';

const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
};

export const generateSalaryPreview = asyncHandler(async (req, res) => {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);

    if (!month || !year) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Month and Year parameters are required.');
    }

    const totalDays = getDaysInMonth(year, month);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month - 1, totalDays, 23, 59, 59);

    // 1. Fetch active employees (or those who left in this month)
    const employees = await Employee.find({
        $or: [
            { isActive: true },
            { dateOfLeaving: { $gte: startDate } }
        ]
    }).select('employeeCode employeeName basicSalary hra conveyance specialAllowance incentive salaryType');

    // 2. Fetch attendance for this month
    const attendances = await Attendance.find({
        date: { $gte: startDate, $lte: endDate }
    });

    const attendanceMap = {};
    attendances.forEach(att => {
        const empId = att.employee.toString();
        if (!attendanceMap[empId]) attendanceMap[empId] = 0;
        // Basic calculation: Present counts as 1 day
        if (att.status === 'Present') {
            attendanceMap[empId] += 1;
        } else if (att.status === 'Half Day') {
            attendanceMap[empId] += 0.5;
        }
    });

    // 3. Draft calculation
    const previewRecords = employees.map(emp => {
        const daysWorked = attendanceMap[emp._id.toString()] || 0;
        const fraction = totalDays > 0 ? (daysWorked / totalDays) : 0;

        const basic = Math.round((emp.basicSalary || 0) * fraction);
        const hra = Math.round((emp.hra || 0) * fraction);
        const conveyance = Math.round((emp.conveyance || 0) * fraction);
        const specialAllowance = Math.round((emp.specialAllowance || 0) * fraction);
        const incentives = Math.round((emp.incentive || 0) * fraction); // Based on fraction or flat? Assume fraction for simplicity unless mapped later.
        
        const grossAmount = basic + hra + conveyance + specialAllowance + incentives;
        const deductions = 0;
        const netPayable = grossAmount - deductions;

        return {
            employeeId: emp._id,
            employeeCode: emp.employeeCode,
            employeeName: emp.employeeName,
            masterGross: (emp.basicSalary || 0) + (emp.hra || 0) + (emp.conveyance || 0) + (emp.specialAllowance || 0),
            totalDays,
            daysWorked,
            basic,
            hra,
            conveyance,
            specialAllowance,
            incentives,
            deductions,
            grossAmount,
            netPayable,
            isNew: true
        };
    });

    res.send(new ApiResponse(httpStatus.OK, previewRecords, 'Preview generated successfully based on Attendance.'));
});

export const getSavedSalaries = asyncHandler(async (req, res) => {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);

    const records = await SalaryWorking.find({ month, year }).populate('employeeId', 'employeeCode employeeName');
    
    // Format to match preview shape for UI simplicity
    const formatted = records.map(r => ({
        _id: r._id,
        employeeId: r.employeeId._id,
        employeeCode: r.employeeId.employeeCode,
        employeeName: r.employeeId.employeeName,
        totalDays: r.totalDays,
        daysWorked: r.daysWorked,
        basic: r.basic,
        hra: r.hra,
        conveyance: r.conveyance,
        specialAllowance: r.specialAllowance,
        incentives: r.incentives,
        deductions: r.deductions,
        grossAmount: r.grossAmount,
        netPayable: r.netPayable,
        status: r.status,
        isNew: false
    }));

    res.send(new ApiResponse(httpStatus.OK, formatted, 'Saved workings fetched.'));
});

export const saveSalaryBatch = asyncHandler(async (req, res) => {
    const { month, year, records } = req.body;

    if (!month || !year || !Array.isArray(records)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payload');
    }

    const bulkOps = records.map(r => ({
        updateOne: {
            filter: { month, year, employeeId: r.employeeId },
            update: {
                $set: {
                    month,
                    year,
                    employeeId: r.employeeId,
                    totalDays: r.totalDays,
                    daysWorked: r.daysWorked,
                    basic: r.basic,
                    hra: r.hra,
                    conveyance: r.conveyance,
                    specialAllowance: r.specialAllowance,
                    incentives: r.incentives,
                    deductions: r.deductions,
                    grossAmount: r.grossAmount,
                    netPayable: r.netPayable,
                    status: r.status || 'Draft',
                    createdBy: req.user._id
                }
            },
            upsert: true
        }
    }));

    if (bulkOps.length > 0) {
        await SalaryWorking.bulkWrite(bulkOps);
    }

    res.send(new ApiResponse(httpStatus.OK, null, 'Salary Working successfully saved.'));
});
