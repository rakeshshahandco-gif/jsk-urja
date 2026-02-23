import mongoose from 'mongoose';

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
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'],
        default: 'MEDIUM'
    },
    status: {
        type: String,
        enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE'],
        default: 'OPEN'
    },
    assignmentMode: {
        type: String,
        enum: ['SELF', 'SINGLE', 'MULTI', 'ALL', 'GROUP'],
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
        required: true
    },
    assigneeIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
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
            enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
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
            enum: ['NEVER', 'DATE', 'ON_COUNT'],
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
    }
}, {
    timestamps: true
});

const Task = mongoose.model('Task', taskSchema);

export { Task };
