import mongoose from 'mongoose';

const taskGroupItemSchema = new mongoose.Schema(
    {
        groupTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaskGroup',
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: [true, 'Item title is required'],
            trim: true,
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        amount: {
            type: Number,
            default: 0,
        },
        /** Day-of-month or offset rule hint, e.g. 10 / "LWD" / "BEFORE_11". */
        dueDayRule: {
            type: String,
            trim: true,
            default: '',
        },
        dueOffsetDays: {
            type: Number,
            default: 0,
        },
        priority: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'],
            default: 'MEDIUM',
        },
        recurrenceType: {
            type: String,
            enum: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
            default: 'MONTHLY',
        },
        checklist: {
            type: [String],
            default: [],
        },
        responsibleRole: {
            type: String,
            trim: true,
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
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
