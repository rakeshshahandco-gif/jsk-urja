import mongoose from 'mongoose';
import { attachmentSchemaDef } from './prdProject.model.js';

const prdIssueSchema = new mongoose.Schema(
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
        date: {
            type: Date,
            default: Date.now
        },
        foundDuring: {
            type: String,
            enum: ['Assembly', 'Testing', 'Field Trial', 'Customer Feedback', 'Burn-in'],
            required: true
        },
        issueTitle: {
            type: String,
            required: true,
            trim: true
        },
        detailedProblem: {
            type: String,
            required: true
        },
        failureCategory: {
            type: String,
            enum: [
                'Heating',
                'Flicker',
                'Voltage fluctuation',
                'Connectivity',
                'Output issue',
                'Component failure',
                'PCB issue',
                'Firmware bug',
                'Mechanical issue',
                'Other'
            ],
            required: true
        },
        severity: {
            type: String,
            enum: ['Low', 'Medium', 'High', 'Critical'],
            default: 'Medium'
        },
        foundBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rootCause: String,
        correctiveAction: String,
        preventiveAction: String,
        status: {
            type: String,
            enum: ['Open', 'In Progress', 'Resolved', 'Reopened', 'Closed'],
            default: 'Open'
        },
        linkedChangeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdChangeLog'
        },
        linkedTestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdTestReport'
        },
        attachments: [attachmentSchemaDef],
        closureRemark: String
    },
    {
        timestamps: true
    }
);

export const PrdIssue = mongoose.model('PrdIssue', prdIssueSchema);
export default PrdIssue;
