import mongoose from 'mongoose';

const componentReplacementSchema = new mongoose.Schema({
    entryNo: { type: String, unique: true },
    date: { type: Date, required: true, default: Date.now },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSheet', default: null },
    workOrderNo: { type: String, default: '' },
    finishedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    finishedItemName: { type: String, default: '' },
    qtyUnderTesting: { type: Number, default: 0 },
    testedBy: { type: String, default: '' },
    remarks: { type: String, default: '' },
    components: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        itemCode: { type: String, default: '' },
        itemName: { type: String, default: '' },
        uom: { type: String, default: 'NOS' },
        damagedQty: { type: Number, default: 0 },
        replacementQty: { type: Number, required: true, min: 0.01 },
        reason: { type: String, default: '' },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const ComponentReplacement = mongoose.model('ComponentReplacement', componentReplacementSchema);
export { ComponentReplacement };
