import mongoose from 'mongoose';

const taskGroupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Group name is required'],
            trim: true,
        },
        notes: {
            type: String,
            trim: true
        },
        visibility: {
            type: String,
            enum: ['PRIVATE', 'TEAM', 'COMPANY'],
            default: 'COMPANY'
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const TaskGroup = mongoose.model('TaskGroup', taskGroupSchema);

export { TaskGroup };
