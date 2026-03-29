import mongoose from 'mongoose';
import { attachmentSchemaDef } from './prdProject.model.js';

const prdApprovalSchema = new mongoose.Schema(
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
        approvedFor: {
            type: String,
            required: true,
            enum: ['Prototype Approval', 'Pilot Approval', 'Production Release', 'Customer Approval']
        },
        approvalDate: {
            type: Date,
            default: Date.now
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        qaApproval: {
            status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            date: Date,
            remarks: String
        },
        rdApproval: {
            status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            date: Date,
            remarks: String
        },
        managementApproval: {
            status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            date: Date,
            remarks: String
        },
        finalStatus: {
            type: String,
            enum: ['Approved', 'Rejected', 'Hold', 'Pending'],
            default: 'Pending'
        },
        releaseNote: {
            type: String,
            trim: true
        },
        approvedBomAttachment: attachmentSchemaDef,
        approvedTestReportAttachment: attachmentSchemaDef,
        approvedSchematicAttachment: attachmentSchemaDef,
        isLocked: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Business validation: Once finalStatus is Approved, it locks the revision.
prdApprovalSchema.pre('save', function (next) {
    if (this.isModified('finalStatus') && this.finalStatus === 'Approved') {
        this.isLocked = true;
    }
    next();
});

export const PrdApproval = mongoose.model('PrdApproval', prdApprovalSchema);
export default PrdApproval;
