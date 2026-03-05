import mongoose from 'mongoose';

const companyProfileSchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: true,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
            default: '',
        },
        city: {
            type: String,
            trim: true,
            default: '',
        },
        state: {
            type: String,
            trim: true,
            default: '',
        },
        stateCode: {
            type: String,
            trim: true,
            default: '',
        },
        pincode: {
            type: String,
            trim: true,
            default: '',
        },
        gstNumber: {
            type: String,
            trim: true,
            default: '',
        },
        panNumber: {
            type: String,
            trim: true,
            default: '',
        },
        logoUrl: {
            type: String,
            trim: true,
            default: '',
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

export const CompanyProfile = mongoose.model('CompanyProfile', companyProfileSchema);
