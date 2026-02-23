import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';

// Get all users (Admin only)
export const getUsers = asyncHandler(async (req, res) => {
    const users = await User.find({}).select('-password');
    res.status(200).json(new ApiResponse(200, users, 'Users fetched successfully'));
});

// Get single user by ID
export const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
        res.status(200).json(new ApiResponse(200, user, 'User details fetched successfully'));
    } else {
        throw new ApiError(404, 'User not found');
    }
});

// Create new user (Admin only)
export const createUser = asyncHandler(async (req, res) => {
    const logData = `[${new Date().toISOString()}] ATTEMPT: ${JSON.stringify(req.body)}\n`;
    try {
        const { name, username, email, mobile, password, role, permissions } = req.body;

        // Ensure optional fields are handled correctly
        const normalizedEmail = (email && email.trim() !== '') ? email.trim().toLowerCase() : undefined;
        const normalizedMobile = (mobile && mobile.trim() !== '') ? mobile.trim() : undefined;

        const query = { $or: [{ username: username.toLowerCase() }] };
        if (normalizedEmail) {
            query.$or.push({ email: normalizedEmail });
        }

        const userExists = await User.findOne(query);
        if (userExists) {
            const conflictField = userExists.username === username.toLowerCase() ? 'Username' : 'Email';
            const logError = `[${new Date().toISOString()}] CONFLICT: ${conflictField} "${conflictField === 'Username' ? username : normalizedEmail}" taken by ${userExists.name} (${userExists._id})\n`;

            throw new ApiError(400, `U_CTRL: ${conflictField} already exists (Used by ${userExists.name})`);
        }

        const userData = {
            name,
            username: username.toLowerCase(),
            email: normalizedEmail,
            mobile: normalizedMobile,
            password,
            role: role || 'viewer',
            permissions: permissions || [],
            isActive: req.body.isActive !== undefined ? req.body.isActive : true
        };

        const user = await User.create(userData);

        if (user) {
            user.password = undefined;
            res.status(201).json(new ApiResponse(201, user, 'U_CTRL: User created successfully'));
        } else {
            throw new ApiError(400, 'U_CTRL: Invalid user data');
        }
    } catch (error) {
        console.error('Error in createUser:', error);
        if (error.name === 'ValidationError') {
            const message = Object.values(error.errors).map(val => val.message).join(', ');
            throw new ApiError(400, 'U_CTRL: ' + message);
        }
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            throw new ApiError(400, `U_CTRL: ${field.charAt(0).toUpperCase() + field.slice(1)} already exists`);
        }
        throw error;
    }
});

// Update user details
export const updateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;
        user.username = req.body.username || user.username;
        user.mobile = req.body.mobile || user.mobile;

        // Only Admin can update roles
        if (req.body.role && req.user.role === 'admin') {
            user.role = req.body.role;
        }

        // Only Admin can update permissions
        if (req.body.permissions && req.user.role === 'admin') {
            user.permissions = req.body.permissions;
        }

        // Only Admin can update active status
        if (req.body.isActive !== undefined && req.user.role === 'admin') {
            user.isActive = req.body.isActive;
        }

        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();
        updatedUser.password = undefined;

        res.status(200).json(new ApiResponse(200, updatedUser, 'User updated successfully'));
    } else {
        throw new ApiError(404, 'User not found');
    }
});

// Delete user (Admin only)
export const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        await User.deleteOne({ _id: user._id });
        res.status(200).json(new ApiResponse(200, null, 'User removed'));
    } else {
        throw new ApiError(404, 'User not found');
    }
});

// Get users for assignment (available to all authenticated users)
export const getAssignableUsers = asyncHandler(async (req, res) => {
    const users = await User.find({ isActive: true }).select('name username fullName email');
    res.status(200).json(new ApiResponse(200, users, 'Assignable users fetched successfully'));
});
