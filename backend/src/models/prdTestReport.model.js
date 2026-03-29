import mongoose from 'mongoose';
import { attachmentSchemaDef } from './prdProject.model.js';

// Dynamic sub-array for multi-point readings (like Heating 15min, Heating 30min)
const dynamicReadingSchema = new mongoose.Schema({
    pointLabel: { type: String, required: true }, // e.g. "After 15 min", "180V"
    reading: { type: String },
    passFail: { type: String, enum: ['Pass', 'Fail', 'N/A'] }
}, { _id: false });

const testDetailSchema = new mongoose.Schema({
    parameterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PrdTestParameter',
        required: true
    },
    parameterName: String, // Denormalized for quick history viewing without join
    standardValue: String,
    actualReading: String, // Single reading
    dynamicReadings: [dynamicReadingSchema], // Multi-point readings
    unit: String,
    minLimit: Number,
    maxLimit: Number,
    passFail: {
        type: String,
        enum: ['Pass', 'Fail', 'N/A'],
        default: 'N/A'
    },
    observation: String,
    attachment: attachmentSchemaDef
});

const prdTestReportSchema = new mongoose.Schema(
    {
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdProject',
            required: true
        },
        productCode: String,
        productName: String,
        prototypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PrdPrototype'
        },
        revisionNo: {
            type: String,
            required: true
        },
        testDate: {
            type: Date,
            default: Date.now
        },
        testedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        sampleQty: { type: Number, default: 1 },
        sampleSerialNo: String,
        ambientTemperature: String,
        testLocation: String,
        testType: {
            type: String,
            enum: ['Initial Test', 'Validation Test', 'Re-Test', 'Final Test', 'Customer Complaint Test', 'Reliability Test'],
            default: 'Initial Test'
        },
        testStatus: {
            type: String,
            enum: ['Pass', 'Fail', 'Conditional Pass', 'Retest Required'],
            default: 'Fail'
        },
        overallRemarks: String,
        details: [testDetailSchema]
    },
    {
        timestamps: true
    }
);

export const PrdTestReport = mongoose.model('PrdTestReport', prdTestReportSchema);
export default PrdTestReport;
