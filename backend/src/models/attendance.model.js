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
        inTime: {
            type: String, // Raw imported in time
            default: '',
        },
        outTime: {
            type: String, // Raw imported out time
            default: '',
        },
        inTimeActual: {
            type: Date, // Parsed in time Date object
        },
        outTimeActual: {
            type: Date, // Parsed out time Date object
        },
        workDuration: {
            type: String, // e.g., '8h 30m'
            default: '',
        },
        workingHours: {
            type: Number, // Total hours worked (numerical)
            default: 0,
        },
        lateMinutes: {
            type: Number, // Delay in arrival in minutes
            default: 0,
        },
        isLate: {
            type: Boolean,
            default: false,
        },
        earlyInMinutes: {
            type: Number, // Early arrival in minutes
            default: 0,
        },
        isEarlyIn: {
            type: Boolean,
            default: false,
        },
        lateOutMinutes: {
            type: Number, // Late departure in minutes
            default: 0,
        },
        isLateOut: {
            type: Boolean,
            default: false,
        },
        earlyOutMinutes: {
            type: Number, // Early departure in minutes
            default: 0,
        },
        isEarlyOut: {
            type: Boolean,
            default: false,
        },
        isHalfDay: {
            type: Boolean,
            default: false,
        },
        isMissingCheckout: {
            type: Boolean,
            default: false,
        },
        isHoliday: {
            type: Boolean,
            default: false,
        },
        isSunday: {
            type: Boolean,
            default: false,
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
