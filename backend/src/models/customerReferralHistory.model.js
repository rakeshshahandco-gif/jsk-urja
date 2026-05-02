import mongoose from 'mongoose';

const customerReferralHistorySchema = mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
        },
        oldDetails: {
            sourceType: String,
            salespersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor' },
            incentiveApplicable: Boolean,
            incentiveType: String,
            incentiveValue: Number,
        },
        newDetails: {
            sourceType: String,
            salespersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor' },
            incentiveApplicable: Boolean,
            incentiveType: String,
            incentiveValue: Number,
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        changeDate: {
            type: Date,
            default: Date.now,
        },
        reason: {
            type: String,
            default: '',
        }
    },
    {
        timestamps: true,
    }
);

const CustomerReferralHistory = mongoose.model('CustomerReferralHistory', customerReferralHistorySchema);

export default CustomerReferralHistory;
