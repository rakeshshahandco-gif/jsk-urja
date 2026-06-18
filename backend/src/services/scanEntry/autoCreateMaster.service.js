import { Supplier } from '../../models/supplier.model.js';
import { Item } from '../../models/item.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import { resolveSupplierFromExtract, ensureSupplierLedger } from './masterMatch.service.js';

async function generateSupplierCode() {
    const lastSupplier = await Supplier.findOne({}, { supplierCode: 1 })
        .collation({ locale: 'en', numericOrdering: true })
        .sort({ supplierCode: -1 })
        .lean();
    let nextNum = 1;
    if (lastSupplier?.supplierCode) {
        const m = String(lastSupplier.supplierCode).match(/(\d+)/);
        if (m) nextNum = Number(m[1]) + 1;
    }
    let code;
    let ok = false;
    while (!ok) {
        code = `SUP-${String(nextNum).padStart(4, '0')}`;
        ok = !(await Supplier.exists({ supplierCode: new RegExp(`^${code}$`, 'i') }));
        if (!ok) nextNum += 1;
    }
    return code;
}

async function generateItemCode() {
    const lastItem = await Item.findOne({ itemCode: { $regex: /^I\d+$/ } }, { itemCode: 1 })
        .collation({ locale: 'en', numericOrdering: true })
        .sort({ itemCode: -1 })
        .lean();
    let next = 1;
    if (lastItem?.itemCode) {
        const n = parseInt(String(lastItem.itemCode).replace('I', ''), 10);
        if (!Number.isNaN(n)) next = n + 1;
    }
    let code;
    let ok = false;
    while (!ok) {
        code = `I${String(next).padStart(4, '0')}`;
        ok = !(await Item.exists({ itemCode: code }));
        if (!ok) next += 1;
    }
    return code;
}

export async function ensureSupplierFromExtract(ex, userId) {
    const resolved = await resolveSupplierFromExtract(ex);
    if (resolved.supplier) {
        await ensureSupplierLedger(resolved.supplier);
        return Supplier.findById(resolved.supplier._id);
    }

    const gst = String(ex?.supplierGstin || '').trim().toUpperCase();
    const name = String(ex?.supplierName || '').trim();
    if (!gst && !name) return null;

    const supplierCode = await generateSupplierCode();
    const supplier = await Supplier.create({
        supplierCode,
        supplierName: name || `Supplier ${gst || supplierCode}`,
        gstNumber: gst,
        gstType: ex?.gstType || 'CGST / SGST',
        state: ex?.placeOfSupply || '',
        address: ex?.supplierAddress || '',
        isActive: true,
        createdBy: userId || null,
        remarks: 'Auto-created from Scan Entry import',
    });

    const ledgerId = await ensureSupplierLedger(supplier);
    if (ledgerId) {
        await Supplier.findByIdAndUpdate(supplier._id, { ledgerId });
        supplier.ledgerId = ledgerId;
    }
    return supplier;
}

export async function ensureItemFromExtract(row, userId) {
    const itemName = String(row?.itemName || row?.ocrItemName || '').trim();
    if (!itemName) return null;

    const byName = await Item.findOne({ itemName: new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), isDeleted: { $ne: true } });
    if (byName) return byName;

    if (row?.itemCode) {
        const byCode = await Item.findOne({ itemCode: String(row.itemCode).trim().toUpperCase(), isDeleted: { $ne: true } });
        if (byCode) return byCode;
    }

    const itemCode = await generateItemCode();
    const item = await Item.create({
        itemCode,
        itemName,
        itemCategory: 'RAW_MATERIAL',
        itemType: 'OTHER',
        uom: row?.uom || 'NOS',
        hsnCode: row?.hsnCode || row?.ocrHsn || '',
        purchaseGst: Number(row?.gstRate) || 18,
        purchaseRate: Number(row?.rate) || 0,
        openingStock: 0,
        currentStock: 0,
        isActive: true,
        createdBy: userId || null,
        description: 'Auto-created from Scan Entry import',
    });
    return item;
}

export async function ensureExpenseLedgerFromExtract(ex, userId) {
    const name = String(ex?.vendorName || ex?.supplierName || '').trim();
    if (!name) return null;

    const existing = await AccountLedger.findOne({
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        type: 'Expense',
    }).lean();
    if (existing) return existing;

    // Expense ledgers are usually under Indirect Expenses; fallback to any expense-type ledger group via name match only.
    const ledger = await AccountLedger.findOne({ type: 'Expense', name: new RegExp(name.slice(0, 20), 'i') }).lean();
    return ledger;
}
