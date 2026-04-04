import mongoose from 'mongoose';

const salaryWorkingSchema = new mongoose.Schema({
    month: {
        type: Number,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    totalDays: {
        type: Number,
        default: 0
    },
    daysWorked: {
        type: Number,
        default: 0
    },
    paidLeaves: {
        type: Number,
        default: 0
    },
    basic: {
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
    incentives: {
        type: Number,
        default: 0
    },
    deductions: {
        type: Number,
        default: 0
    },
    grossAmount: {
        type: Number,
        default: 0
    },
    netPayable: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Draft', 'Finalized', 'Paid'],
        default: 'Draft'
    },
    remarks: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Ensure unique entry per employee per month
salaryWorkingSchema.index({ month: 1, year: 1, employeeId: 1 }, { unique: true });

export const SalaryWorking = mongoose.model('SalaryWorking', salaryWorkingSchema);
