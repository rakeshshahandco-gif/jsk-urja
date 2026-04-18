import mongoose from 'mongoose';

const hsnMasterSchema = new mongoose.Schema({
    hsnSacCode: {
        type: String,
        required: [true, 'HSN/SAC Code is required'],
        unique: true,
        trim: true,
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
    },
    defaultUqc: {
        type: String,
        trim: true,
        default: '',
    },
    isService: {
        type: Boolean,
        default: false, // false = Goods (HSN), true = Service (SAC)
    },
    gstRate: {
        type: Number,
        default: 18,
    },
    cessRate: {
        type: Number,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, { timestamps: true });

hsnMasterSchema.index({ hsnSacCode: 1 });
hsnMasterSchema.index({ hsnSacCode: 'text', description: 'text' });

const HsnMaster = mongoose.model('HsnMaster', hsnMasterSchema);
export { HsnMaster };
