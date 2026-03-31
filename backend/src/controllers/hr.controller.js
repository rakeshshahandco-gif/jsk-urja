import httpStatus from 'http-status';
import { Shift } from '../models/shift.model.js';
import { Employee } from '../models/employee.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
