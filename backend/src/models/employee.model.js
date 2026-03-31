import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
    employeeCode: {
        type: String,
        required: [true, 'Employee code is required'],
        unique: true,
        trim: true
    },
    employeeName: {
        type: String,
        required: [true, 'Employee name is required'],
        trim: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: [true, 'Department is required']
    },
    designation: {
        type: String,
        required: [true, 'Designation is required'],
        trim: true
    },
    branch: {
        type: String,
        required: [true, 'Branch / Location is required'],
        trim: true
    },
    reportingManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    mobileNumber: {
        type: String,
        required: [true, 'Mobile number is required'],
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    address: {
        type: String,
        trim: true
    },
    dateOfJoining: {
        type: Date,
        required: [true, 'Date of Joining is required']
    },
    dateOfLeaving: {
        type: Date
    },
    employmentStatus: {
        type: String,
        enum: ['Active', 'Inactive', 'Resigned', 'Terminated'],
        default: 'Active'
    },
    employmentType: {
        type: String,
        enum: ['Permanent', 'Temporary', 'Contract', 'Trainee'],
        default: 'Permanent'
    },
    shiftType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift',
        required: [true, 'Shift type is required']
    },
    weeklyOff: {
        type: [String],
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        default: ['Sunday']
    },
    salaryType: {
        type: String,
        enum: ['Monthly', 'Daily', 'Hourly'],
        default: 'Monthly'
    },
    basicSalary: {
        type: Number,
        default: 0
    },
    hra: {
        type: Number,
        default: 0
    },
    conveyance: {
        type: Number,
        default: 0
    },
    specialAllowance: {
        type: Number,
        default: 0
    },
    incentive: {
        type: Number,
        default: 0
    },
    overtimeRate: {
        type: Number,
        default: 0
    },
    pfApplicable: {
        type: Boolean,
        default: false
    },
    esicApplicable: {
        type: Boolean,
        default: false
    },
    bankName: {
        type: String,
        trim: true
    },
    bankAccountNumber: {
        type: String,
        trim: true
    },
    ifscCode: {
        type: String,
        trim: true
    },
    uan: {
        type: String,
        trim: true
    },
    aadhaarNo: {
        type: String,
        trim: true
    },
    panNo: {
        type: String,
        trim: true
    },
    remarks: {
        type: String,
        trim: true
    },
    employeePhoto: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

const Employee = mongoose.model('Employee', employeeSchema);

export { Employee };
