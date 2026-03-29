import mongoose from 'mongoose';
import { attachmentSchemaDef } from './prdProject.model.js';

const prdChangeLogSchema = new mongoose.Schema(
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
        changeDate: {
            type: Date,
            default: Date.now
        },
        changeType: {
            type: String,
            required: true,
            enum: [
                'Component Change',
                'Circuit Change',
                'Firmware Change',
                'Layout Change',
                'Mechanical Change',
                'Test Method Change'
            ]
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        problemBeforeChange: {
            type: String,
            trim: true
        },
        rootCause: {
            type: String,
            trim: true
        },
        changeDone: {
            type: String,
            required: true,
            trim: true
        },
        affectedArea: String,
        oldValue: String,
        newValue: String,
        expectedResult: String,
        actualResultAfterChange: String,
        testReferenceNo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdTestReport'
        },
        finalStatus: {
            type: String,
            enum: ['Successful', 'Not Successful', 'Need More Change', 'Under Observation'],
            default: 'Under Observation'
        },
        attachments: [attachmentSchemaDef],
        remarks: String
    },
    {
        timestamps: true
    }
);

export const PrdChangeLog = mongoose.model('PrdChangeLog', prdChangeLogSchema);
export default PrdChangeLog;
