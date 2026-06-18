import mongoose from 'mongoose';

const accountGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Group name is required'],
        trim: true,
    },
    parentGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AccountGroup',
        default: null
    },
    nature: {
        type: String,
        enum: ['Assets', 'Liabilities', 'Income', 'Expenses'],
        required: true
    },
    affectGrossProfit: {
        type: Boolean,
        default: false
    },
    sortOrder: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for fast hierarchy lookups
accountGroupSchema.index({ parentGroup: 1 });
accountGroupSchema.index({ nature: 1 });
accountGroupSchema.index({ companyId: 1, name: 1 }, { unique: true });

const AccountGroup = mongoose.model('AccountGroup', accountGroupSchema);

export { AccountGroup };
