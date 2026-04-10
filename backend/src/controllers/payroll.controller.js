import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { SalaryWorking } from '../models/salaryWorking.model.js';
import { Holiday } from '../models/holiday.model.js';
import { recalculateMonthlySalary } from '../services/payroll.service.js';

const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
};

const getSundaysInRange = (start, end) => {
    let count = 0;
    let current = new Date(start);
    while (current <= end) {
        if (current.getDay() === 0) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
};

export const generateSalaryPreview = asyncHandler(async (req, res) => {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);

    if (!month || !year) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Month and Year parameters are required.');
    }

    // Call the centralized calculation engine without saving to strictly retrieve preview.
    const previewRecords = await recalculateMonthlySalary(month, year, null, false);

    console.log('Sending preview records size:', previewRecords.length);
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
        masterGross: r.masterGross,
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
                    masterGross: r.masterGross,
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
