import mongoose from 'mongoose';

const reminderSchema = mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
        },
        followUpId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Followup',
        },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
        },
        reminderDate: {
            type: Date,
            required: true,
        },
        reminderTime: {
            type: String, // format "HH:mm"
            required: false,
            default: '09:00',
        },
        followUpType: {
            type: String,
            // enum: ['CALL', 'WHATSAPP'],
            required: true,
        },
        taskNote: {
            type: String,
        },
        priority: {
            type: String,
            // enum: ['high', 'medium', 'low'],
            default: 'medium',
        },
        isClosed: {
            type: Boolean,
            default: false,
        },
        closedAt: {
            type: Date,
        },
        extendedFrom: {
            type: Date,
        },
        extendedTo: {
            type: Date,
        },
        rescheduleCount: {
            type: Number,
            default: 0,
        },
        rescheduleHistory: [
            {
                fromDate: Date,
                fromTime: String,
                toDate: Date,
                toTime: String,
                changedAt: Date,
                reason: String,
            },
        ],
        lastReminderDate: {
            type: Date,
        },
        lastReminderTime: {
            type: String,
        },
        rescheduledAt: {
            type: Date,
        },
        isNotified: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
reminderSchema.index({ customerId: 1 });
reminderSchema.index({ reminderDate: 1, isClosed: 1 });
reminderSchema.index({ priority: 1 });

/**
 * @typedef Reminder
 */
const Reminder = mongoose.model('Reminder', reminderSchema);

export default Reminder;
