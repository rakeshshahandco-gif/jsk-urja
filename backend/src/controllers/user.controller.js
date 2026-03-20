import httpStatus from 'http-status';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Department } from '../models/department.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// --- ROLE CONTROLLERS ---

export const createRole = asyncHandler(async (req, res) => {
    const role = await Role.create({ ...req.body, createdBy: req.user.id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, role, 'Role created successfully'));
});

export const getRoles = asyncHandler(async (req, res) => {
    const roles = await Role.find({ isActive: true });
    res.send(new ApiResponse(httpStatus.OK, roles));
});

export const updateRole = asyncHandler(async (req, res) => {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!role) throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
    res.send(new ApiResponse(httpStatus.OK, role, 'Role updated successfully'));
});

// --- DEPARTMENT CONTROLLERS ---

export const createDepartment = asyncHandler(async (req, res) => {
    const dept = await Department.create({ ...req.body, createdBy: req.user.id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, dept, 'Department created successfully'));
});

export const getDepartments = asyncHandler(async (req, res) => {
    const depts = await Department.find({ isActive: true });
    res.send(new ApiResponse(httpStatus.OK, depts));
});

// --- USER CONTROLLERS ---

export const getUsers = asyncHandler(async (req, res) => {
    const users = await User.find()
        .populate('role', 'name')
        .populate('department', 'name')
        .select('-password');
    res.send(new ApiResponse(httpStatus.OK, users));
});

export const createUser = asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (role) {
        const roleDoc = await Role.findById(role);
        if (roleDoc) {
            req.body.roleName = roleDoc.name;
        }
    }
    const user = await User.create(req.body);
    const userResponse = await User.findById(user._id).select('-password').populate('role', 'name');
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, userResponse, 'User created successfully'));
});

export const getUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .populate('role')
        .populate('department')
        .populate('reportingManager', 'name')
        .select('-password');
    if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    res.send(new ApiResponse(httpStatus.OK, user));
});

export const updateUser = asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (role) {
        const roleDoc = await Role.findById(role);
        if (roleDoc) {
            req.body.roleName = roleDoc.name;
        }
    }
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true })
        .populate('role', 'name')
        .populate('department', 'name')
        .select('-password');
    if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    res.send(new ApiResponse(httpStatus.OK, user, 'User updated successfully'));
});

export const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'User deleted successfully'));
});
