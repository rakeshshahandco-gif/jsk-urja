import mongoose from 'mongoose';
import { realtimeSyncPlugin } from '../plugins/realtimeSync.plugin.js';

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    priority: {
        type: String,
        // enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'],
        default: 'MEDIUM'
    },
    status: {
        type: String,
        // enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE'],
        default: 'OPEN'
    },
    assignmentMode: {
        type: String,
        // enum: ['SELF', 'SINGLE', 'MULTI', 'ALL', 'GROUP'],
        default: 'SELF'
    },
    assignedGroupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null
    },
    taskCategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskCategory',
        default: null
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null
    },
    assignToAll: {
        type: Boolean,
        default: false
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskGroup',
        required: false // Relaxed for legacy compatibility
    },
    assigneeIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    taskMasterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskMaster',
        description: 'New field linking to the task template'
    },
    amount: {
        type: Number,
        default: 0
    },
    billNumber: {
        type: String,
        trim: true
    },
    referenceNumber: {
        type: String,
        trim: true
    },
    remarks: {
        type: String,
        trim: true
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dueDate: {
        type: Date,
        required: [true, 'Due date is required']
    },
    completedAt: {
        type: Date
    },
    closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    closedAt: {
        type: Date,
        default: null
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    extensionHistory: [
        {
            oldDate: Date,
            newDate: Date,
            reason: String,
            extendedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            extendedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    recurrence: {
        enabled: {
            type: Boolean,
            default: false
        },
        frequency: {
            type: String,
            // enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'EVERY_2_MONTHS', 'EVERY_6_MONTHS', 'QUARTERLY', 'YEARLY'],
            default: 'MONTHLY'
        },
        interval: {
            type: Number,
            default: 1
        },
        recurrenceSeriesId: {
            type: String
        },
        recurrenceEndType: {
            type: String,
            // enum: ['NEVER', 'DATE', 'ON_COUNT'],
            default: 'NEVER'
        },
        recurrenceEndDate: {
            type: Date
        },
        recurrenceEndCount: {
            type: Number
        },
        occurrenceCount: {
            type: Number,
            default: 1
        }
    },
    previousTaskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
        default: null
    },
    parentTaskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task'
    },
    nextGeneratedId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task'
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        default: null
    },
    updates: [
        {
            text: { type: String, required: true },
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            userName: String,
            date: { type: Date, default: Date.now },
            status: { type: String, default: 'OPEN' }, // OPEN, RESOLVED
            isResolution: { type: Boolean, default: false },
            parentId: mongoose.Schema.Types.ObjectId // Pointer to the entry being resolved
        }
    ]
}, {
    timestamps: true
});

taskSchema.plugin(realtimeSyncPlugin);

const Task = mongoose.model('Task', taskSchema);

export { Task };
