import mongoose from 'mongoose';

const customerTypeMasterSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

customerTypeMasterSchema.index({ name: 1 }, { unique: true });

export const CustomerTypeMaster = mongoose.model('CustomerTypeMaster', customerTypeMasterSchema);
export default CustomerTypeMaster;
