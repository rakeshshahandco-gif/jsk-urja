import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { Item } from '../../models/item.model.js';
import { ScanEntryItemAlias } from '../../models/scanEntryItemAlias.model.js';
import { ScanEntryKeywordMap } from '../../models/scanEntryKeywordMap.model.js';
import { logAudit } from './audit.service.js';
import { saveMasterMapping } from '../importCenter/importLearning.service.js';
import { Supplier } from '../../models/supplier.model.js';
import {
    resolveSupplierFromExtract,
    resolveCustomerFromExtract,
    ensureSupplierLedger,
    findItemMaster,
    buildPendingSupplierPayload,
} from './masterMatch.service.js';
import { isLedgerOnlyPurchase } from './postingMode.util.js';

const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function autoMapDraft(draftId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) return null;
    const ex = draft.extractedData || {};
    const mappingNotes = [];

    if (draft.moduleType === 'purchase_invoice') {
        const resolved = await resolveSupplierFromExtract(ex, draft.companyId);
        if (resolved.supplier) {
            draft.mappedSupplierId = resolved.supplier._id;
            try {
                await ensureSupplierLedger(resolved.supplier);
            } catch {
                // ledger link must not block mapping
            }
            if (resolved.gstMismatch) {
                const billGst = String(ex?.supplierGstin || '').trim().toUpperCase();
                mappingNotes.push(`Supplier matched by ${resolved.matchMethod}; bill GSTIN (${billGst || '—'}) differs from master (${resolved.supplier.gstNumber || '—'}) — verify before posting`);
            } else if (resolved.nameMismatch) {
                mappingNotes.push(`Supplier matched by ${resolved.matchMethod}; bill name differs from master "${resolved.supplier.supplierName}"`);
            } else {
                mappingNotes.push(`Supplier auto-selected by ${resolved.matchMethod}`);
            }
        } else if (!draft.mappedSupplierId) {
            const hasPending = (draft.pendingMasters || []).some((p) => p.type === 'supplier' && p.status === 'pending');
            if (!hasPending) {
                draft.pendingMasters = [...(draft.pendingMasters || []), buildPendingSupplierPayload(ex, draft.companyId, draft.financialYear)];
            }
            mappingNotes.push('Supplier not found — create draft supplier and approve before posting');
        }
    } else if (draft.moduleType === 'sales_invoice') {
        const resolved = await resolveCustomerFromExtract(ex);
        if (resolved.customer) {
            draft.mappedCustomerId = resolved.customer._id;
            mappingNotes.push(`Customer auto-selected by ${resolved.matchMethod}`);
        }
    } else if (draft.moduleType === 'expense_bill') {
        for (const kw of ex.suggestedKeywords || []) {
            const m = await ScanEntryKeywordMap.findOne({ keyword: String(kw).toLowerCase().trim() }).lean();
            if (m) { draft.mappedLedgerId = m.ledgerId; break; }
        }
    }

    const items = Array.isArray(ex.items) ? ex.items : [];
    const prevByLine = new Map((draft.mappedItems || []).map((m) => [Number(m.ocrLineIndex), m]));
    draft.mappedItems = [];
    for (let i = 0; i < items.length; i++) {
        const r = items[i];
        const prev = prevByLine.get(i);
        let item = null;

        if (prev?.itemId) {
            item = await Item.findOne({ _id: prev.itemId, isDeleted: { $ne: true } }).lean();
        }
        if (!item && draft.mappedSupplierId && r.itemName) {
            const alias = await ScanEntryItemAlias.findOne({ supplierId: draft.mappedSupplierId, ocrItemName: r.itemName }).lean();
            if (alias?.itemId) item = await Item.findById(alias.itemId).lean();
        }
        if (!item && r.itemCode) item = await Item.findOne({ itemCode: r.itemCode, isDeleted: { $ne: true } }).lean();
        if (!item) {
            const found = await findItemMaster(r);
            if (found?.item) item = found.item;
        }
        draft.mappedItems.push({
            ocrLineIndex: i,
            ocrItemName: r.itemName || '',
            ocrItemCode: r.itemCode || '',
            ocrHsn: r.hsnCode || '',
            itemId: item?._id || null,
            itemName: item?.itemName || r.itemName || '',
            itemCode: item?.itemCode || r.itemCode || '',
            hsnCode: item?.hsnCode || r.hsnCode || '',
            uom: item?.uom || r.uom || 'NOS',
            qty: Number(r.qty) || 0,
            rate: Number(r.rate) || 0,
            gstRate: Number(r.gstRate) || 18,
            discountPercent: Number(r.discountPercent) || 0,
            purchaseType: 'RAW_MATERIAL_PURCHASE',
        });
    }

    const unresolved =
        (draft.moduleType === 'purchase_invoice' && !draft.mappedSupplierId) ||
        (draft.moduleType === 'sales_invoice' && !draft.mappedCustomerId) ||
        (draft.moduleType === 'expense_bill' && !draft.mappedLedgerId) ||
        (!isLedgerOnlyPurchase(draft) && draft.mappedItems.some((m) => !m.itemId));
    if (!['posted', 'rejected'].includes(draft.status)) {
        draft.status = unresolved ? 'needs_review' : 'ready_to_post';
    }
    if (mappingNotes.length) {
        draft.extractedData = { ...ex, _mappingNotes: mappingNotes };
    }
    await draft.save();
    return draft;
}

export async function setSupplierMapping(draftId, supplierId, userId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new Error('Draft not found');
    const old = draft.mappedSupplierId;
    draft.mappedSupplierId = supplierId;
    const ex = draft.extractedData || {};
    const importedName = String(ex.supplierName || ex.vendorName || '').trim();
    if (importedName && draft.companyId) {
        try {
            const supplier = await Supplier.findById(supplierId).lean();
            if (supplier) {
                await saveMasterMapping({
                    companyId: draft.companyId,
                    entityType: 'supplier',
                    importedName,
                    entityId: supplierId,
                    entityLabel: supplier.supplierName,
                    userId,
                });
            }
        } catch {
            // learning save must not block supplier mapping
        }
    }
    await draft.save();
    await logAudit(draftId, 'map_supplier', userId, { supplierId: old }, { supplierId });
    return autoMapDraft(draftId);
}

export async function updateItemMappings(draftId, mappedItems, userId, saveAliases = false) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new Error('Draft not found');
    draft.mappedItems = mappedItems;
    await draft.save();
    if (saveAliases && draft.mappedSupplierId) {
        for (const row of mappedItems) {
            if (row.itemId && row.ocrItemName) {
                await ScanEntryItemAlias.findOneAndUpdate(
                    { supplierId: draft.mappedSupplierId, ocrItemName: row.ocrItemName },
                    { itemId: row.itemId, createdBy: userId },
                    { upsert: true },
                );
            }
        }
    }
    await logAudit(draftId, 'map_items', userId);
    return autoMapDraft(draftId);
}

