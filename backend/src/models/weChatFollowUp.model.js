import mongoose from 'mongoose';

const weChatFollowUpSchema = new mongoose.Schema({
    referenceType: {
        type: String,
        enum: ['WeChatProduct', 'WeChatContact', 'WeChatGroup', 'WeChatPriceRecord', 'WeChatSample'],
        required: true,
        index: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    
    followUpDate: { type: Date, required: true, default: Date.now },
    nextFollowUpDate: { type: Date },
    
    followUpType: {
        type: String,
        enum: ['Price', 'Sample', 'Technical', 'Payment', 'Dispatch', 'General'],
        default: 'General'
    },
    
    notes: { type: String, required: true },
    
    reminderRequired: { type: Boolean, default: false },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' }, // Link to standard CRM Task if reminder required
    
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// Indexes for fast searching
weChatFollowUpSchema.index({ referenceType: 1, referenceId: 1, followUpDate: -1 });

const WeChatFollowUp = mongoose.model('WeChatFollowUp', weChatFollowUpSchema);

export { WeChatFollowUp };
