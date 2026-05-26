import mongoose from 'mongoose';

const costCenterSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true, default: '' },
    type: {
        type: String,
        enum: ['Cost Centre', 'Profit Centre'],
        default: 'Cost Centre',
    },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter', default: null },
    description: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

costCenterSchema.index({ name: 1, companyId: 1 }, { unique: true, sparse: true });
costCenterSchema.index({ parentId: 1 });
costCenterSchema.index({ type: 1 });

const CostCenter = mongoose.model('CostCenter', costCenterSchema);
export { CostCenter };
