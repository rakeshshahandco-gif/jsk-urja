import mongoose from 'mongoose';

const HIGHLIGHT_STYLES = ['blue', 'teal', 'indigo', 'amber', 'rose', 'violet', 'emerald', 'slate'];

const taskGroupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Group name is required'],
            trim: true,
        },
        notes: {
            type: String,
            trim: true,
        },
        groupType: {
            type: String,
            trim: true,
            default: 'Compliance',
        },
        userIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }],
        coordinatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        visibility: {
            type: String,
            enum: ['PRIVATE', 'TEAM', 'COMPANY'],
            default: 'COMPANY',
        },
        /** Recurrence label for hub cards (actual generation stays on TaskMaster). */
        recurrenceType: {
            type: String,
            enum: ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
            default: 'MONTHLY',
        },
        recurrenceInterval: {
            type: Number,
            default: 1,
            min: 1,
        },
        recurrenceStartDate: {
            type: Date,
            default: null,
        },
        recurrenceEndDate: {
            type: Date,
            default: null,
        },
        defaultPriority: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'],
            default: 'MEDIUM',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        showInTaskHub: {
            type: Boolean,
            default: true,
        },
        isHighlighted: {
            type: Boolean,
            default: false,
        },
        highlightOrder: {
            type: Number,
            default: 0,
        },
        highlightIcon: {
            type: String,
            trim: true,
            default: 'calendar',
        },
        highlightStyle: {
            type: String,
            enum: HIGHLIGHT_STYLES,
            default: 'blue',
        },
        /** When false (default), group tasks stay out of Today/Upcoming/Overdue general lists. */
        showInGeneralTaskLists: {
            type: Boolean,
            default: false,
        },
        notifyAllMembers: {
            type: Boolean,
            default: true,
        },
        allowMembersUpdate: {
            type: Boolean,
            default: true,
        },
        isDefaultSelected: {
            type: Boolean,
            default: false,
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

taskGroupSchema.index({ isHighlighted: 1, highlightOrder: 1 });
taskGroupSchema.index({ showInGeneralTaskLists: 1, isActive: 1 });

const TaskGroup = mongoose.model('TaskGroup', taskGroupSchema);

export { TaskGroup, HIGHLIGHT_STYLES };
