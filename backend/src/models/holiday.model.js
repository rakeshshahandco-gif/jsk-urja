import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Holiday name is required'],
        trim: true
    },
    date: {
        type: Date,
        required: [true, 'Holiday date is required']
    },
    type: {
        type: String,
        enum: ['National', 'Public', 'Company', 'Optional'],
        default: 'Public'
    },
    description: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index by date for efficient querying
holidaySchema.index({ date: 1 });

const Holiday = mongoose.model('Holiday', holidaySchema);

export { Holiday };
