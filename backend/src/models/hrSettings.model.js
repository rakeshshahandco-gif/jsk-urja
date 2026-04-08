import mongoose from 'mongoose';

const hrSettingsSchema = new mongoose.Schema(
    {
        officeStartTime: {
            type: String, // HH:mm format, e.g., "10:00"
            default: '10:00',
        },
        graceMinutes: {
            type: Number,
            default: 10,
        },
        halfDayThresholdHours: {
            type: Number,
            default: 4,
        },
        isSundayPaid: {
            type: Boolean,
            default: true,
        },
        isHolidayPaid: {
            type: Boolean,
            default: true,
        },
        singlePunchIsPresent: {
            type: Boolean,
            default: true,
        },
        missingCheckoutHandling: {
            type: String,
            enum: ['Mark as Missing', 'Mark as Absent', 'Mark as Present'],
            default: 'Mark as Missing',
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

export const HRSettings = mongoose.model('HRSettings', hrSettingsSchema);
