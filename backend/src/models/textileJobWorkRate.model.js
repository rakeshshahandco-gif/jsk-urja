import mongoose from 'mongoose';
import { TEXTILE_JOB_WORK_PROCESSES, TEXTILE_RATE_TYPES, TEXTILE_PARTY_TYPES } from '../constants/textileJobWorkRate.constants.js';

/** Future-ready: fabric-wise rate overrides (not used in v1). */
const fabricRateSchema = new mongoose.Schema(
    {
        fabricType: { type: String, trim: true, required: true },
        rate: { type: Number, required: true, min: 0 },
    },
    { _id: false },
);

const textileJobWorkRateSchema = new mongoose.Schema(
    {
        processName: {
            type: String,
            required: true,
            trim: true,
            enum: TEXTILE_JOB_WORK_PROCESSES,
        },
        vendorWorker: {
            type: String,
            required: true,
            trim: true,
        },
        partyType: {
            type: String,
            enum: TEXTILE_PARTY_TYPES,
            default: 'vendor',
        },
        rateType: {
            type: String,
            required: true,
            enum: TEXTILE_RATE_TYPES,
        },
        defaultRate: {
            type: Number,
            required: true,
            min: 0,
        },
        effectiveDate: {
            type: Date,
            default: () => new Date(),
        },
        remarks: {
            type: String,
            trim: true,
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        /** Reserved for fabric-wise rates — empty in v1. */
        fabricRates: {
            type: [fabricRateSchema],
            default: [],
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true },
);

textileJobWorkRateSchema.index({ companyId: 1, processName: 1, vendorWorker: 1, isActive: 1 });
textileJobWorkRateSchema.index({ companyId: 1, partyType: 1, isActive: 1 });

const TextileJobWorkRate = mongoose.model('TextileJobWorkRate', textileJobWorkRateSchema);
export { TextileJobWorkRate };
