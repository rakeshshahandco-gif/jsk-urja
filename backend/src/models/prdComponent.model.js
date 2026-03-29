import mongoose from 'mongoose';
import { attachmentSchemaDef } from './prdProject.model.js';

const prdComponentSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdProject',
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        },
        componentType: {
            type: String,
            required: true,
            enum: ['IC', 'MOSFET', 'Transformer', 'Relay', 'MCU', 'Sensor', 'Module', 'Other']
        },
        componentName: {
            type: String,
            required: true,
            trim: true
        },
        partNo: {
            type: String,
            trim: true
        },
        manufacturer: {
            type: String,
            trim: true
        },
        supplier: {
            type: String,
            trim: true
        },
        datasheet: attachmentSchemaDef,
        keySpecification: {
            type: String,
            trim: true
        },
        reasonForSelection: {
            type: String,
            trim: true
        },
        alternativeComponent: {
            type: String,
            trim: true
        },
        trialStatus: {
            type: String,
            enum: ['Pending', 'Under Review', 'Approved', 'Rejected'],
            default: 'Pending'
        },
        remarks: {
            type: String,
            trim: true
        },
        enteredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    },
    {
        timestamps: true
    }
);

export const PrdComponent = mongoose.model('PrdComponent', prdComponentSchema);
export default PrdComponent;
