import mongoose from 'mongoose';

const itemTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Item type name is required'],
        trim: true,
        unique: true
    },
    code: {
        type: String,
        required: [true, 'Item type code is required'],
        trim: true,
        unique: true,
        uppercase: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    isElectrical: {
        type: Boolean,
        default: false,
        // If true, shows Technical Specs tab in Item Form
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

const ItemType = mongoose.model('ItemType', itemTypeSchema);
export { ItemType };
