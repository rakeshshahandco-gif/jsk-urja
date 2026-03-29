import mongoose from 'mongoose';
import { attachmentSchemaDef } from './prdProject.model.js';

const prdDesignSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdProject',
            required: true
        },
        revisionNo: {
            type: String,
            required: true,
            default: '1.0'
        },
        date: {
            type: Date,
            default: Date.now
        },
        designType: {
            type: String,
            required: true,
            enum: ['Schematic', 'PCB', 'Firmware', 'Mechanical', 'BOM', 'Testing Method']
        },
        previousRevision: {
            type: String,
            trim: true
        },
        newRevision: {
            type: String,
            trim: true
        },
        changeSummary: {
            type: String,
            required: true,
            trim: true
        },
        detailedChangeDescription: {
            type: String,
            trim: true
        },
        reasonForChange: {
            type: String,
            trim: true
        },
        attachments: [attachmentSchemaDef],
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        checkedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['Draft', 'Under Review', 'Approved', 'Rejected'],
            default: 'Draft'
        }
    },
    {
        timestamps: true
    }
);

export const PrdDesign = mongoose.model('PrdDesign', prdDesignSchema);
export default PrdDesign;
