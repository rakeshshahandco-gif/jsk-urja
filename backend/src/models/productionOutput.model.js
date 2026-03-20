import mongoose from 'mongoose';

const productionOutputSchema = new mongoose.Schema({
    entryNo: { type: String, unique: true },
    date: { type: Date, required: true, default: Date.now },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSheet', default: null },
    workOrderNo: { type: String, default: '' },
    finishedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    finishedItemCode: { type: String, default: '' },
    finishedItemName: { type: String, default: '' },
    qtyProduced: { type: Number, required: true, min: 0.01 },
    warehouse: { type: String, default: '' },
    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const ProductionOutput = mongoose.model('ProductionOutput', productionOutputSchema);
export { ProductionOutput };
