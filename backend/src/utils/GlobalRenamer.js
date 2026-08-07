
import { AccountLedger } from '../models/accountLedger.model.js';
import { LedgerEntry } from '../models/ledgerEntry.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { Voucher } from '../models/voucher.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { GRN } from '../models/grn.model.js';
import { Item } from '../models/item.model.js';
import { ReplacementDispatch } from '../models/replacementDispatch.model.js';
import { FaultyReceipt } from '../models/faultyReceipt.model.js';
import { Complaint } from '../models/complaint.model.js';
import { ComponentReplacement } from '../models/componentReplacement.model.js';
import { NameChangeLog } from '../models/nameChangeLog.model.js';
import { Gstr1PeriodStatus } from '../models/gstr1PeriodStatus.model.js';
import { AccountingPeriodLock } from '../models/accountingPeriodLock.model.js';
import logger from './logger.js';

function returnPeriodFromDate(d) {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

async function filedPeriodSet(companyId) {
    if (!companyId) return new Set();
    const rows = await Gstr1PeriodStatus.find({ companyId, status: 'Filed' }).select('returnPeriod').lean();
    return new Set(rows.map((r) => r.returnPeriod));
}

async function isBooksLockedFy(financialYear) {
    if (!financialYear) return false;
    const lock = await AccountingPeriodLock.findOne({ financialYear, isActive: true }).lean();
    return Boolean(lock?.booksLockedTill);
}

export class GlobalRenamer {
    /**
     * Propagates a name change globally across the system.
     * Statutory snapshots (filed GSTR-1, e-invoice, locked FY) are NOT overwritten.
     */
    static async propagate({ masterType, id, oldName, newName, userId, companyId }) {
        if (!newName || oldName === newName) return;

        logger.info(`🚀 Global Rename [${masterType}]: "${oldName}" -> "${newName}" (ID: ${id})`);

        try {
            await NameChangeLog.create({
                masterType,
                masterId: id,
                oldName,
                newName,
                changedBy: userId,
                changedAt: new Date()
            });

            switch (masterType) {
                case 'CUSTOMER':
                    await this.propagateCustomerRename(id, oldName, newName, companyId);
                    break;
                case 'SUPPLIER':
                    await this.propagateSupplierRename(id, oldName, newName, companyId);
                    break;
                case 'ITEM':
                    await this.propagateItemRename(id, oldName, newName, companyId);
                    break;
                case 'LEDGER':
                    await this.propagateLedgerRename(id, oldName, newName, companyId);
                    break;
                default:
                    logger.warn(`⚠️ Unsupported master type for propagation: ${masterType}`);
            }

            logger.info(`✅ Global Rename Completed for ${newName}`);
        } catch (error) {
            logger.error(`❌ Global Rename Failed:`, error);
            throw error;
        }
    }

    static async propagateCustomerRename(id, oldName, newName, companyId) {
        const ledger = await AccountLedger.findOneAndUpdate(
            { referenceId: id, referenceModel: 'Customer' },
            { $set: { name: newName, printName: newName } },
            { new: true }
        );

        if (ledger) {
            await this.propagateLedgerRename(ledger._id, oldName, newName, companyId || ledger.companyId);
        }

        const filedSet = await filedPeriodSet(companyId || ledger?.companyId);
        const invoices = await SalesInvoice.find({ customerId: id, isDeleted: { $ne: true } });
        let siUpdated = 0;
        let siProtected = 0;
        for (const inv of invoices) {
            const period = returnPeriodFromDate(inv.invoiceDate);
            const locked =
                filedSet.has(period) ||
                inv.irn ||
                inv.eInvoiceStatus === 'Generated' ||
                (await isBooksLockedFy(inv.financialYear));
            if (locked) {
                siProtected += 1;
                continue;
            }
            if (inv.customerName !== newName) {
                inv.customerName = newName;
                await inv.save();
                siUpdated += 1;
            }
        }

        const soResult = await SalesOrder.updateMany({ customerId: id }, { $set: { customerName: newName } });
        const rdResult = await ReplacementDispatch.updateMany({ customerId: id }, { $set: { customerName: newName } });
        const frResult = await FaultyReceipt.updateMany({ customerId: id }, { $set: { customerName: newName } });
        const cpResult = await Complaint.updateMany({ customerId: id }, { $set: { customerName: newName } });
        const crResult = await ComponentReplacement.updateMany({ customerId: id }, { $set: { customerName: newName } });

        if (oldName) {
            await SalesInvoice.updateMany(
                {
                    customerId: null,
                    customerName: oldName,
                    eInvoiceStatus: { $ne: 'Generated' },
                    $or: [{ irn: null }, { irn: '' }],
                },
                { $set: { customerName: newName, customerId: id } },
            );
            await SalesOrder.updateMany({ customerId: null, customerName: oldName }, { $set: { customerName: newName, customerId: id } });
            await ReplacementDispatch.updateMany({ customerId: null, customerName: oldName }, { $set: { customerName: newName, customerId: id } });
            await Complaint.updateMany({ customerId: null, customerName: oldName }, { $set: { customerName: newName, customerId: id } });
        }

        logger.info(`   - Customer sync: SI open(${siUpdated}) protected(${siProtected}), SO(${soResult.modifiedCount}), RD(${rdResult.modifiedCount}), FR(${frResult.modifiedCount}), CP(${cpResult.modifiedCount}), CR(${crResult.modifiedCount})`);
    }

    static async propagateSupplierRename(id, oldName, newName, companyId) {
        const ledger = await AccountLedger.findOneAndUpdate(
            { referenceId: id, referenceModel: 'Supplier' },
            { $set: { name: newName, printName: newName } },
            { new: true }
        );

        if (ledger) {
            await this.propagateLedgerRename(ledger._id, oldName, newName, companyId || ledger.companyId);
        }

        const invoices = await PurchaseInvoice.find({ supplierId: id, isDeleted: { $ne: true } });
        let piUpdated = 0;
        let piProtected = 0;
        for (const inv of invoices) {
            if (await isBooksLockedFy(inv.financialYear)) {
                piProtected += 1;
                continue;
            }
            if (inv.supplierName !== newName) {
                inv.supplierName = newName;
                await inv.save();
                piUpdated += 1;
            }
        }

        const poResult = await PurchaseOrder.updateMany({ supplierId: id }, { $set: { supplierName: newName } });
        const grnResult = await GRN.updateMany({ supplierId: id }, { $set: { supplierName: newName } });

        if (oldName) {
            await PurchaseInvoice.updateMany({ supplierId: null, supplierName: oldName }, { $set: { supplierName: newName, supplierId: id } });
            await PurchaseOrder.updateMany({ supplierId: null, supplierName: oldName }, { $set: { supplierName: newName, supplierId: id } });
            await GRN.updateMany({ supplierId: null, supplierName: oldName }, { $set: { supplierName: newName, supplierId: id } });
        }

        logger.info(`   - Supplier sync: PI open(${piUpdated}) protected(${piProtected}), PO(${poResult.modifiedCount}), GRN(${grnResult.modifiedCount})`);
    }

    static async propagateLedgerRename(ledgerId, oldName, newName) {
        // 1. Ledger Entries
        const leResult = await LedgerEntry.updateMany({ ledgerId: ledgerId }, { $set: { ledgerName: newName } });

        // 2. Vouchers (Linked by partyId)
        const vPartyResult = await Voucher.updateMany({ partyId: ledgerId }, { $set: { partyName: newName } });

        // 3. Vouchers (Linked in items.ledgerId) - Using arrayFilters for multiple updates
        const vItemsResult = await Voucher.updateMany(
            { 'items.ledgerId': ledgerId },
            { $set: { 'items.$[elem].ledgerName': newName } },
            { arrayFilters: [{ 'elem.ledgerId': ledgerId }] }
        );

        // 4. Fallbacks (Orphaned by Name)
        if (oldName) {
            const fallbackLE = await LedgerEntry.updateMany({ ledgerId: null, ledgerName: oldName }, { $set: { ledgerName: newName, ledgerId: ledgerId } });
            const fallbackVP = await Voucher.updateMany({ partyId: null, partyName: oldName }, { $set: { partyName: newName, partyId: ledgerId } });
            const fallbackVI = await Voucher.updateMany(
                { 'items.ledgerId': null, 'items.ledgerName': oldName },
                { $set: { 'items.$[elem].ledgerName': newName, 'items.$[elem].ledgerId': ledgerId } },
                { arrayFilters: [{ 'elem.ledgerName': oldName }] }
            );
            
            logger.info(`   - Ledger Fallbacks: LE(${fallbackLE.modifiedCount}), Voucher Header(${fallbackVP.modifiedCount}), Voucher Items(${fallbackVI.modifiedCount})`);
        }

        logger.info(`   - Ledger sync total: LE(${leResult.modifiedCount}), Vouchers(${vPartyResult.modifiedCount} Header, ${vItemsResult.modifiedCount} Items)`);
    }

    static async propagateItemRename(itemId, oldName, newName) {
        // 1. Sales Invoices (Using arrayFilters for robustness)
        const siResult = await SalesInvoice.updateMany(
            { 'items.itemId': itemId },
            { $set: { 'items.$[elem].itemName': newName } },
            { arrayFilters: [{ 'elem.itemId': itemId }] }
        );

        // 2. Sales Orders
        const soResult = await SalesOrder.updateMany(
            { 'items.itemId': itemId },
            { $set: { 'items.$[elem].itemName': newName } },
            { arrayFilters: [{ 'elem.itemId': itemId }] }
        );

        // 3. Purchase Invoices
        const piResult = await PurchaseInvoice.updateMany(
            { 'items.itemId': itemId },
            { $set: { 'items.$[elem].itemName': newName } },
            { arrayFilters: [{ 'elem.itemId': itemId }] }
        );

        // 4. GRN
        const grnResult = await GRN.updateMany(
            { 'items.itemId': itemId },
            { $set: { 'items.$[elem].itemName': newName } },
            { arrayFilters: [{ 'elem.itemId': itemId }] }
        );

        // 5. Fallbacks for orphaned items (by name)
        if (oldName) {
            const fallbackSI = await SalesInvoice.updateMany(
                { 'items.itemId': null, 'items.itemName': oldName },
                { $set: { 'items.$[elem].itemName': newName, 'items.$[elem].itemId': itemId } },
                { arrayFilters: [{ 'elem.itemName': oldName }] }
            );
            const fallbackSO = await SalesOrder.updateMany(
                { 'items.itemId': null, 'items.itemName': oldName },
                { $set: { 'items.$[elem].itemName': newName, 'items.$[elem].itemId': itemId } },
                { arrayFilters: [{ 'elem.itemName': oldName }] }
            );
            
            logger.info(`   - Item Fallbacks: SI(${fallbackSI.modifiedCount}), SO(${fallbackSO.modifiedCount})`);
        }

        logger.info(`   - Item sync total: SI(${siResult.modifiedCount}), SO(${soResult.modifiedCount}), PI(${piResult.modifiedCount}), GRN(${grnResult.modifiedCount})`);
    }
}
