import mongoose from 'mongoose';

/** Append-only costing / GP audit trail */
const costingAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: [
                'RM_COST_UPDATE',
                'BOM_COST_SNAPSHOT',
                'PRODUCTION_COST_SNAPSHOT',
                'MANUAL_COST_OVERRIDE',
                'ITEM_COST_EDIT',
                'SALES_GP_SNAPSHOT',
                'GP_RECALCULATION',
                'COST_SOURCE_CHANGE',
            ],
            required: true,
        },
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },
        productionSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionCostSnapshot', default: null },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

costingAuditLogSchema.index({ action: 1, createdAt: -1 });
costingAuditLogSchema.index({ itemId: 1, createdAt: -1 });

export const CostingAuditLog = mongoose.model('CostingAuditLog', costingAuditLogSchema);
