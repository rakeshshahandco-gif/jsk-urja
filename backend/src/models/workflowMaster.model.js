import mongoose from 'mongoose';
import { WORKFLOW_STAGE_TYPES } from '../constants/workflowMaster.constants.js';

const workflowStageSchema = new mongoose.Schema(
    {
        stageName: { type: String, required: true, trim: true },
        sequenceNo: { type: Number, required: true, min: 1 },
        stageType: {
            type: String,
            enum: WORKFLOW_STAGE_TYPES,
            default: 'general',
        },
        allowStart: { type: Boolean, default: true },
        allowComplete: { type: Boolean, default: true },
        allowSkip: { type: Boolean, default: false },
        remarksRequired: { type: Boolean, default: false },
        attachmentRequired: { type: Boolean, default: false },
    },
    { _id: true },
);

const workflowMasterSchema = new mongoose.Schema(
    {
        workflowName: {
            type: String,
            required: [true, 'Workflow name is required'],
            trim: true,
        },
        workflowCode: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            unique: true,
        },
        industryTemplateRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'IndustryTemplate',
            required: [true, 'Industry template is required'],
        },
        description: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        stages: { type: [workflowStageSchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

workflowMasterSchema.index({ industryTemplateRef: 1, isActive: 1 });
workflowMasterSchema.index({ workflowName: 1 });

const WorkflowMaster = mongoose.model('WorkflowMaster', workflowMasterSchema);
export { WorkflowMaster };
