import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { PurchaseInvoice } from '../../models/purchaseInvoice.model.js';
import { Supplier } from '../../models/supplier.model.js';

const TOLERANCE = 1;
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function checkDuplicate(draftId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt || draft.moduleType !== 'purchase_invoice') return draft;
    const ex = draft.extractedData || {};
    const billNo = String(ex.supplierInvoiceNo || ex.invoiceNo || ex.billNo || '').trim();
    const billDate = ex.invoiceDate || ex.billDate;
    const grandTotal = Number(ex.grandTotal) || 0;
    if (!billNo && !grandTotal) {
        draft.duplicateCheckResult = { isDuplicate: false };
        await draft.save();
        return draft;
    }
    const query = { isDeleted: { $ne: true }, status: { $ne: 'Cancelled' }, financialYear: draft.financialYear };
    if (draft.mappedSupplierId) query.supplierId = draft.mappedSupplierId;
    else if (ex.supplierGstin) {
        const sup = await Supplier.findOne({ gstNumber: String(ex.supplierGstin).trim().toUpperCase(), isDeleted: { $ne: true } }).lean();
        if (sup) query.supplierId = sup._id;
    }
    if (billNo) query.supplierInvoiceNo = new RegExp(`^${esc(billNo)}$`, 'i');

    const candidates = await PurchaseInvoice.find(query).select('_id invoiceNumber supplierInvoiceNo invoiceDate grandTotal supplierName').limit(10).lean();
    const matches = candidates.filter((inv) => {
        const amtOk = !grandTotal || Math.abs(r2(inv.grandTotal) - grandTotal) <= TOLERANCE;
        const dateOk = !billDate || !inv.invoiceDate || new Date(billDate).toDateString() === new Date(inv.invoiceDate).toDateString();
        return amtOk && dateOk;
    });
    draft.duplicateCheckResult = { isDuplicate: matches.length > 0, matches: matches.map((m) => ({ invoiceId: m._id, invoiceNumber: m.invoiceNumber, supplierInvoiceNo: m.supplierInvoiceNo, invoiceDate: m.invoiceDate, grandTotal: m.grandTotal, supplierName: m.supplierName })) };
    if (matches.length && !draft.adminOverrideReason) draft.status = 'duplicate_found';
    await draft.save();
    return draft;
}

export async function overrideDuplicate(draftId, reason) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new Error('Draft not found');
    draft.adminOverrideReason = reason || '';
    draft.status = 'ready_to_post';
    await draft.save();
    return draft;
}

