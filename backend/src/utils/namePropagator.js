import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { Voucher } from '../models/voucher.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { GRN } from '../models/grn.model.js';
import { ReplacementDispatch } from '../models/replacementDispatch.model.js';
import { FaultyReceipt } from '../models/faultyReceipt.model.js';
import { Complaint } from '../models/complaint.model.js';
import { ComponentReplacement } from '../models/componentReplacement.model.js';
import logger from './logger.js';

/**
 * Propagates name changes from Customer/Supplier masters to all related transactional records.
 * 
 * @param {Object} params
 * @param {string} params.id - Customer or Supplier ID
 * @param {string} params.oldName - Previous name
 * @param {string} params.newName - New name to propagate
 * @param {('Customer'|'Supplier')} params.type - Entity type
 */
export const propagateNameChange = async ({ id, oldName, newName, type, force = false }) => {
    if (!newName || (!force && oldName === newName)) return;

    logger.info(`🔄 Propagating name change for ${type} [${id}]: "${oldName}" -> "${newName}"`);

    try {
        // 1. Update AccountLedger (match by referenceId)
        let ledger;
        try {
            ledger = await AccountLedger.findOneAndUpdate(
                { referenceId: id, referenceModel: type },
                { $set: { name: newName, printName: newName } },
                { new: true }
            );
        } catch (ledgerErr) {
            if (ledgerErr.code === 11000) {
                logger.warn(`   ⚠️  Ledger Name Duplicate: Could not rename ledger to "${newName}" because it already exists. Proceeding with other updates...`);
                // Find current ledger to at least get its ID for other updates
                ledger = await AccountLedger.findOne({ referenceId: id, referenceModel: type });
            } else {
                throw ledgerErr;
            }
        }

        if (ledger) {
            const ledgerId = ledger._id;

            // 2. Update LedgerEntries
            const leResult = await LedgerEntry.updateMany(
                { ledgerId: ledgerId },
                { $set: { ledgerName: newName } }
            );
            logger.info(`   - Updated ${leResult.modifiedCount} LedgerEntries`);

            // 3. Update Vouchers
            // Update partyName (header)
            const vPartyResult = await Voucher.updateMany(
                { partyId: ledgerId },
                { $set: { partyName: newName } }
            );
            // Update items.ledgerName (array)
            const vItemsResult = await Voucher.updateMany(
                { 'items.ledgerId': ledgerId },
                { $set: { 'items.$.ledgerName': newName } }
            );
            logger.info(`   - Updated ${vPartyResult.modifiedCount} Vouchers (Party) and ${vItemsResult.modifiedCount} Vouchers (Items)`);
        }

        // 4. Update Transactions based on Entity Type
        if (type === 'Customer') {
            // SalesInvoice
            const siResult = await SalesInvoice.updateMany(
                { customerId: id },
                { $set: { customerName: newName } }
            );
            // SalesOrder
            const soResult = await SalesOrder.updateMany(
                { customerId: id },
                { $set: { customerName: newName } }
            );
            // ReplacementDispatch
            const rdResult = await ReplacementDispatch.updateMany(
                { customerId: id },
                { $set: { customerName: newName } }
            );
            // FaultyReceipt
            const frResult = await FaultyReceipt.updateMany(
                { customerId: id },
                { $set: { customerName: newName } }
            );
             // ComponentReplacement
             const crResult = await ComponentReplacement.updateMany(
                { customerId: id },
                { $set: { customerName: newName } }
            );
            // Complaint
            const cpResult = await Complaint.updateMany(
                { customerId: id },
                { $set: { customerName: newName } }
            );
            
            logger.info(`   - Updated Customer Transactions: SI(${siResult.modifiedCount}), SO(${soResult.modifiedCount}), RD(${rdResult.modifiedCount}), FR(${frResult.modifiedCount}), CR(${crResult.modifiedCount}), CP(${cpResult.modifiedCount})`);

        } else if (type === 'Supplier') {
            // PurchaseInvoice
            const piResult = await PurchaseInvoice.updateMany(
                { supplierId: id },
                { $set: { supplierName: newName } }
            );
            // PurchaseOrder
            const poResult = await PurchaseOrder.updateMany(
                { supplierId: id },
                { $set: { supplierName: newName } }
            );
            // GRN
            const grnResult = await GRN.updateMany(
                { supplierId: id },
                { $set: { supplierName: newName } }
            );

            logger.info(`   - Updated Supplier Transactions: PI(${piResult.modifiedCount}), PO(${poResult.modifiedCount}), GRN(${grnResult.modifiedCount})`);
        }

        logger.info(`✅ Name propagation completed for ${newName}`);
    } catch (error) {
        logger.error(`❌ Name propagation failed for ${id}:`, error);
        throw error; // Re-throw to handle in controller/service
    }
};
