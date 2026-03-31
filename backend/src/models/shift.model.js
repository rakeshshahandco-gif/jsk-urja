import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Shift name is required'],
        unique: true,
        trim: true
    },
    startTime: {
        type: String, // format "HH:mm"
        required: [true, 'Start time is required']
    },
    endTime: {
        type: String, // format "HH:mm"
        required: [true, 'End time is required']
    },
    graceMinutes: {
        type: Number,
        default: 15
    },
    fullDayMinHours: {
        type: Number,
        default: 8
    },
    halfDayMinHours: {
        type: Number,
        default: 4
    },
    otStartAfterMinutes: {
        type: Number,
        default: 0 // OT starts after shift ends + these minutes
    },
    breakMinutes: {
        type: Number,
        default: 60
    },
    weeklyOff: {
        type: [String],
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        default: ['Sunday']
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

const Shift = mongoose.model('Shift', shiftSchema);

export { Shift };
