import mongoose from 'mongoose';

const taskMasterSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskCategory'
    },
    priority: {
        type: String,
        // enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group'
    },
    recurrence: {
        frequency: {
            type: String,
            // enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'EVERY_2_MONTHS', 'EVERY_6_MONTHS', 'QUARTERLY', 'YEARLY'],
            required: true
        },
        interval: {
            type: Number,
            default: 1
        },
        startDate: {
            type: Date,
            default: Date.now
        },
        endType: {
            type: String,
            // enum: ['NEVER', 'AFTER_COUNT', 'ON_DATE'],
            default: 'NEVER'
        },
        occurrenceCount: Number,
        endDate: Date
    },
    defaultAmount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    nextRunDate: {
        type: Date
    },
    lastGeneratedAt: {
        type: Date
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

export const TaskMaster = mongoose.model('TaskMaster', taskMasterSchema);
