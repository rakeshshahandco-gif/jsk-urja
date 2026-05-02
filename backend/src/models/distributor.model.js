import mongoose from 'mongoose';

const distributorSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        contactPerson: {
            type: String,
            trim: true,
            default: '',
        },
        mobile: {
            type: String,
            trim: true,
            default: '',
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: '',
        },
        gstin: {
            type: String,
            trim: true,
            uppercase: true,
            default: '',
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
        ledgerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AccountLedger',
            default: null,
        },
        defaultIncentiveType: {
            type: String,
            enum: ['Percentage of sales', 'Fixed amount per invoice', 'Fixed amount per customer', 'Item-wise incentive', 'Manual'],
            default: 'Percentage of sales',
        },
        defaultIncentivePercentage: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['Active', 'Inactive'],
            default: 'Active',
        },
        isDeleted: {
            type: Boolean,
            default: false,
        }
    },
    {
        timestamps: true,
    }
);

const Distributor = mongoose.model('Distributor', distributorSchema);

export default Distributor;
