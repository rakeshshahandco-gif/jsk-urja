import mongoose from 'mongoose';

const taskChatMessageSchema = new mongoose.Schema(
    {
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        content: {
            type: String,
            required: [true, 'Message content cannot be empty'],
            trim: true,
        },
        type: {
            type: String,
            enum: ['text', 'system'],
            default: 'text',
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

// Index for faster queries
taskChatMessageSchema.index({ taskId: 1, createdAt: 1 });

const TaskChatMessage = mongoose.model('TaskChatMessage', taskChatMessageSchema);

export default TaskChatMessage;
