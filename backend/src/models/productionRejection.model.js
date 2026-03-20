import mongoose from 'mongoose';

const productionRejectionSchema = new mongoose.Schema({
    entryNo: { type: String, unique: true },
    date: { type: Date, required: true, default: Date.now },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSheet', default: null },
    workOrderNo: { type: String, default: '' },
    items: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        itemCode: { type: String, default: '' },
        itemName: { type: String, default: '' },
        uom: { type: String, default: 'NOS' },
        rejectionQty: { type: Number, required: true, min: 0.01 },
        reason: {
            type: String,
            enum: ['Damage', 'Burn', 'Broken', 'Defective', 'Short Circuit', 'Expired', 'Other'],
            default: 'Damage',
        },
        remarks: { type: String, default: '' },
    }],
    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const ProductionRejection = mongoose.model('ProductionRejection', productionRejectionSchema);
export { ProductionRejection };
