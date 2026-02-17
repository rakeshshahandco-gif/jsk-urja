import mongoose from 'mongoose';

const taskActivitySchema = new mongoose.Schema(
    {
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        actionType: {
            type: String,
            enum: ['CREATED', 'UPDATED', 'STATUS_CHANGED', 'ASSIGNEES_CHANGED', 'COMMENTED', 'EXPORT'],
            required: true,
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    }
);

const TaskActivity = mongoose.model('TaskActivity', taskActivitySchema);

export { TaskActivity };
