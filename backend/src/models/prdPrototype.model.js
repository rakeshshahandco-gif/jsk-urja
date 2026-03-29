import mongoose from 'mongoose';

const prdPrototypeSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdProject',
            required: true
        },
        revisionNo: {
            type: String,
            required: true
        },
        buildDate: {
            type: Date,
            default: Date.now
        },
        buildQty: {
            type: Number,
            required: true,
            min: 1
        },
        assembledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        pcbVersion: {
            type: String,
            trim: true
        },
        firmwareVersion: {
            type: String,
            trim: true
        },
        majorComponentsUsed: {
            type: String,
            trim: true
        },
        assemblyNotes: {
            type: String,
            trim: true
        },
        sampleType: {
            type: String,
            enum: ['Prototype', 'Pilot', 'Customer Sample', 'Internal Test Sample'],
            default: 'Prototype'
        },
        status: {
            type: String,
            enum: ['Built', 'Testing Pending', 'Testing Running', 'Completed', 'Failed', 'Approved'],
            default: 'Built'
        },
        remarks: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

export const PrdPrototype = mongoose.model('PrdPrototype', prdPrototypeSchema);
export default PrdPrototype;
