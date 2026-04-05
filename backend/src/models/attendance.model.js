import mongoose from 'mongoose';

const attendanceSchema = mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee',
            required: true,
        },
        date: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ['Present', 'Absent', 'Half Day', 'Late', 'Unpaid Leave', 'Paid Leave', 'Holiday'],
            default: 'Present',
        },
        checkIn: {
            type: String, // e.g., '09:00 AM'
            default: '',
        },
        checkOut: {
            type: String, // e.g., '06:00 PM'
            default: '',
        },
        workDuration: {
            type: String, // e.g., '8h 30m'
            default: '',
        },
        remarks: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

// Ensure an employee can only have one attendance record per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
