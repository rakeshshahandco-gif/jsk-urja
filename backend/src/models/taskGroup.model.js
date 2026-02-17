import mongoose from 'mongoose';

const taskGroupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Group name is required'],
            trim: true,
        },
        kind: {
            type: String,
            enum: ['TEMPLATE', 'INSTANCE'],
            default: 'TEMPLATE',
        },
        recurrence: {
            type: String,
            enum: ['NONE', 'MONTHLY', 'WEEKLY', 'QUARTERLY'],
            default: 'NONE',
        },
        recurrenceRule: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        period: {
            type: String, // e.g. "2026-02"
            default: null,
        },
        assignToAll: {
            type: Boolean,
            default: false,
        },
        assigneeIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaskGroup',
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const TaskGroup = mongoose.model('TaskGroup', taskGroupSchema);

export { TaskGroup };
