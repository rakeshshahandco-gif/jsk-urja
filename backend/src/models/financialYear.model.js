import mongoose from 'mongoose';

const financialYearSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true, // e.g. "2025-2026"
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ['Active', 'Closed', 'Archived'],
        default: 'Active',
    },
    isCurrent: {
        type: Boolean,
        default: false,
    },
    remarks: {
        type: String,
        trim: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
    // FY master is shared (2025-26, 2026-27) — not per-company. Without this,
    // tenant scope hides legacy rows that have no companyId on Render.
    disableTenant: true,
});

// Ensure only one FY is marked as current at a time
financialYearSchema.pre('save', async function (next) {
    if (this.isCurrent) {
        await this.constructor.updateMany({ _id: { $ne: this._id } }, { isCurrent: false });
    }
    next();
});

const FinancialYear = mongoose.model('FinancialYear', financialYearSchema);

export { FinancialYear };
