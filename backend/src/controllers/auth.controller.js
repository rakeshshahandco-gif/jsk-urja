import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from 'jsonwebtoken';

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', {
        expiresIn: '30d'
    });
};

export const register = asyncHandler(async (req, res) => {
    const { name, username, email, password, role, permissions } = req.body;

    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
        throw new ApiError(400, 'AUTH_CTRL: User already exists');
    }

    const user = await User.create({
        name,
        username,
        email,
        password,
        role: role || 'viewer',
        permissions: permissions || []
    });

    if (user) {
        res.status(201).json(
            new ApiResponse(201, {
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                token: generateToken(user._id)
            }, 'User registered successfully')
        );
    } else {
        throw new ApiError(400, 'Invalid user data');
    }
});

export const login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Allow login with email or username
    const user = await User.findOne({
        $or: [{ email: username }, { username: username }]
    }).select('+password');

    if (!user) {
        throw new ApiError(401, 'Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
        throw new ApiError(403, 'Your account has been deactivated. Please contact admin.');
    }

    const isMatch = await user.comparePassword(password, user.password);

    if (!isMatch) {
        throw new ApiError(401, 'Invalid credentials');
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });

    // Remove password from response
    const populatedUser = await User.findById(user._id).populate('role', 'name');
    const finalUserData = populatedUser.toObject();
    delete finalUserData.password;
    
    // Ensure roleName is present
    if (!finalUserData.roleName && populatedUser.role?.name) {
        finalUserData.roleName = populatedUser.role.name;
    }

    res.status(200).json(
        new ApiResponse(200, {
            ...finalUserData,
            token: generateToken(user._id)
        }, 'Login successful')
    );
});

export const getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate('role', 'name');

    if (user) {
        const userData = user.toObject();
        // Ensure roleName is present in response
        userData.roleName = userData.roleName || user.role?.name || '';
        
        res.status(200).json(
            new ApiResponse(200, userData, 'User profile fetched successfully')
        );
    } else {
        throw new ApiError(404, 'User not found');
    }
});
