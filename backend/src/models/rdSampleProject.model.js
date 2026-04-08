import mongoose from 'mongoose';

const rdSampleProjectSchema = new mongoose.Schema({
    projectName: {
        type: String,
        required: [true, 'Project Name is required'],
        trim: true
    },
    productName: {
        type: String,
        required: [true, 'Product Name is required'],
        trim: true
    },
    productCode: {
        type: String,
        trim: true
    },
    developmentStage: {
        type: String,
        trim: true
    },
    rdOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Finalized', 'Dropped', 'Hold'],
        default: 'Open'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    finalizationDate: {
        type: Date
    },
    remarks: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

const RdSampleProject = mongoose.model('RdSampleProject', rdSampleProjectSchema);

export { RdSampleProject };
