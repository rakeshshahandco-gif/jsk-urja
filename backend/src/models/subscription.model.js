import mongoose from 'mongoose';

const PLANS = ['free', 'trial', 'monthly', 'yearly', 'enterprise'];
const STATUSES = ['active', 'trial', 'expired', 'suspended'];

const subscriptionSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            unique: true,
            index: true,
        },
        plan: { type: String, enum: PLANS, default: 'trial' },
        status: { type: String, enum: STATUSES, default: 'trial' },

        // Limits
        userLimit: { type: Number, default: 5, min: 1 },
        storageGb: { type: Number, default: 2 },

        // Module access override (if empty, uses Company.enabledModules)
        moduleAccess: { type: [String], default: [] },

        // Dates
        startDate: { type: Date, default: Date.now },
        trialEndsAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },

        // Billing notes / reference
        notes: { type: String, trim: true, default: '' },
        invoiceRef: { type: String, trim: true, default: '' },

        // Audit
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, disableTenant: true },
);

subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ plan: 1 });
subscriptionSchema.index({ expiresAt: 1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export { PLANS, STATUSES };
