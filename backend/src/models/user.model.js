import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    email: {
        type: String,
        unique: true,
        trim: true,
        lowercase: true,
        sparse: true, // Allow null/missing and still be unique
        match: [/^\S+@\S+\.\S+$/, 'Please try a valid email address']
    },
    mobile: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false // Do not return password by default
    },
    // New Fields for User Management Module
    role: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
    },
    roleName: { // Denormalized for quick access
        type: String,
        enum: ['superadmin', 'admin', 'manager', 'staff', 'viewer', 'accounts', 'sales', 'purchase', 'inventory', 'production', 'service'],
        default: 'viewer'
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    },
    employeeCode: {
        type: String,
        trim: true
    },
    designation: {
        type: String,
        trim: true
    },
    reportingManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    joiningDate: {
        type: Date
    },
    profilePhoto: {
        type: String
    },
    allowLogin: {
        type: Boolean,
        default: true
    },
    forcePasswordChange: {
        type: Boolean,
        default: false
    },
    passwordExpiryDays: {
        type: Number,
        default: 90
    },
    dataScope: {
        type: String,
        enum: ['All', 'Own', 'Department', 'Assigned'],
        default: 'Own'
    },
    approvalLimit: {
        type: Number,
        default: 0
    },
    additionalPermissions: {
        type: Object,
        default: {}
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// method to compare password
userSchema.methods.comparePassword = async function (candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

const User = mongoose.model('User', userSchema);

export { User };
