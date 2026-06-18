import mongoose from 'mongoose';
import { TEXTILE_ROUTE_PROCESS_OPTIONS } from '../constants/textileProcessRoute.constants.js';

const routeStageSchema = new mongoose.Schema({
    sequenceNo: { type: Number, required: true, min: 1 },
    processName: {
        type: String,
        required: true,
        trim: true,
        enum: TEXTILE_ROUTE_PROCESS_OPTIONS,
    },
    customProcessName: { type: String, trim: true, default: '' },
    allowSkip: { type: Boolean, default: true },
    remarks: { type: String, trim: true, default: '' },
}, { _id: true });

const textileProcessRouteSchema = new mongoose.Schema({
    routeName: { type: String, required: true, trim: true },
    routeCode: { type: String, required: true, trim: true, uppercase: true },
    industryTemplateRef: { type: mongoose.Schema.Types.ObjectId, ref: 'IndustryTemplate', default: null },
    description: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    stages: { type: [routeStageSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

textileProcessRouteSchema.index({ companyId: 1, routeCode: 1 }, { unique: true });
textileProcessRouteSchema.index({ companyId: 1, isActive: 1 });

const TextileProcessRoute = mongoose.model('TextileProcessRoute', textileProcessRouteSchema);
export { TextileProcessRoute };
