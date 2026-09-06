/**
 * RETIRED — do not register this as a Mongoose model.
 *
 * Atlas / shared Mongo tiers reject new collections once the cluster
 * collection limit is reached (error: "already using 513 collections of 500").
 *
 * Missing Material Issue batches are stored on the existing WorkOrder
 * document as `materialIssueHistory[]`. Stock remains in StockLedger.
 *
 * This file is kept only so old imports fail loudly instead of creating
 * the `workordermaterialissues` collection.
 */

export function assertWorkOrderMaterialIssueCollectionRetired() {
    throw new Error(
        'WorkOrderMaterialIssue collection is retired. Use WorkOrder.materialIssueHistory.'
    );
}
