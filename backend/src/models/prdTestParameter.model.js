import mongoose from 'mongoose';

const prdTestParameterSchema = new mongoose.Schema(
    {
        parameterName: {
            type: String,
            required: true,
            trim: true
        },
        productCategory: {
            type: String,
            required: true,
            enum: ['Dimmable Driver', 'Smart Switch', 'Controller', 'DALI Driver', 'Other'],
            default: 'Other'
        },
        unit: {
            type: String,
            trim: true
        },
        inputType: {
            type: String,
            enum: ['Numeric', 'Pass-Fail', 'Text', 'Multiple-Points'],
            default: 'Numeric'
        },
        lowerLimit: {
            type: Number
        },
        upperLimit: {
            type: Number
        },
        isMandatory: {
            type: Boolean,
            default: true
        },
        sequenceNo: {
            type: Number,
            default: 1
        },
        isActive: {
            type: Boolean,
            default: true
        },
        // To support dynamically adding standard test points (e.g., "180V", "200V" for Voltage Fluctuation)
        dynamicPoints: [{
            pointLabel: String
        }]
    },
    {
        timestamps: true
    }
);

export const PrdTestParameter = mongoose.model('PrdTestParameter', prdTestParameterSchema);
export default PrdTestParameter;
