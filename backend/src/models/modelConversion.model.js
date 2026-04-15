import mongoose from 'mongoose';

const modelConversionSchema = new mongoose.Schema({
    conversionNo: {
        type: String,
        required: true,
        unique: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    fromItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    toItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    qty: {
        type: Number,
        required: true,
        min: 0.01
    },
    returnedComponents: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        itemCode: String,
        itemName: String,
        qty: Number
    }],
    addedComponents: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        itemCode: String,
        itemName: String,
        qty: Number
    }],
    remarks: {
        type: String,
        trim: true
    },
    financialYear: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

export const ModelConversion = mongoose.model('ModelConversion', modelConversionSchema);
