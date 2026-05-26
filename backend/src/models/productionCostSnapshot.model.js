import mongoose from 'mongoose';

const productionCostSnapshotSchema = new mongoose.Schema(
    {
        finishedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        finishedItemCode: { type: String, trim: true, default: '' },
        finishedItemName: { type: String, trim: true, default: '' },
        workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder', default: null },
        workOrderNo: { type: String, trim: true, default: '' },
        productionOutputId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOutput', default: null },
        qtyProduced: { type: Number, required: true, min: 0.01 },
        productionDate: { type: Date, required: true, default: Date.now },
        rmCostUsed: { type: Number, default: 0, min: 0 },
        bomId: { type: mongoose.Schema.Types.ObjectId, ref: 'BOM', default: null },
        bomNumber: { type: String, trim: true, default: '' },
        bomStandardCostPerUnit: { type: Number, default: 0, min: 0 },
        fgCalculatedCostPerUnit: { type: Number, default: 0, min: 0 },
        totalFgCost: { type: Number, default: 0, min: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

productionCostSnapshotSchema.index({ finishedItemId: 1, productionDate: -1 });
productionCostSnapshotSchema.index({ workOrderId: 1 });

export const ProductionCostSnapshot = mongoose.model('ProductionCostSnapshot', productionCostSnapshotSchema);
