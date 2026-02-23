import mongoose from 'mongoose';

const taskGroupItemSchema = new mongoose.Schema(
    {
        groupTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaskGroup',
            required: true,
        },
        title: {
            type: String,
            required: [true, 'Item title is required'],
            trim: true,
        },
        notes: {
            type: String,
            trim: true,
        },
        amount: {
            type: Number,
            default: 0,
        },
        dueOffsetDays: {
            type: Number,
            default: 0,
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

const TaskGroupItem = mongoose.model('TaskGroupItem', taskGroupItemSchema);

export { TaskGroupItem };
