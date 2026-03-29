import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
    filename: String,
    url: String,
    mimetype: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
});

const prdProjectSchema = new mongoose.Schema(
    {
        productCode: {
            type: String,
            required: true,
            trim: true,
            unique: true
        },
        productName: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            required: true,
            enum: ['Dimmable Driver', 'Smart Switch', 'Controller', 'DALI Driver', 'Other'],
            default: 'Other'
        },
        productType: {
            type: String,
            trim: true
        },
        customerName: {
            type: String,
            trim: true
        },
        rdOwner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        hardwareDeveloper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        firmwareDeveloper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        testingEngineer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        startDate: {
            type: Date,
            required: true
        },
        targetCompletionDate: {
            type: Date
        },
        currentStage: {
            type: String,
            enum: [
                'Concept',
                'Component Search',
                'Schematic Design',
                'PCB Design',
                'Prototype Assembly',
                'Initial Testing',
                'Design Change',
                'Re-Testing',
                'Approval',
                'Released to Production'
            ],
            default: 'Concept'
        },
        currentRevisionNo: {
            type: String,
            default: '1.0'
        },
        status: {
            type: String,
            enum: [
                'Open',
                'Under Development',
                'Prototype Ready',
                'Testing Running',
                'Change Required',
                'Approved',
                'Rejected',
                'On Hold',
                'Released'
            ],
            default: 'Open'
        },
        remarks: {
            type: String,
            trim: true
        },
        attachments: [attachmentSchema],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

// We define a plugin or explicitly export schemas if needed for reuse
export const attachmentSchemaDef = attachmentSchema;

export const PrdProject = mongoose.model('PrdProject', prdProjectSchema);
export default PrdProject;
