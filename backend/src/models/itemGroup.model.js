import mongoose from 'mongoose';

const itemGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Item group name is required'],
        trim: true,
        unique: true
    },
    code: {
        type: String,
        required: [true, 'Item group code is required'],
        trim: true,
        unique: true,
        uppercase: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

const ItemGroup = mongoose.model('ItemGroup', itemGroupSchema);
export { ItemGroup };
