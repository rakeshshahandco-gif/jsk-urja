import { ApiError } from '../../utils/ApiError.js';
import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { Supplier } from '../../models/supplier.model.js';
import { buildPendingSupplierPayload, ensureSupplierLedger } from './masterMatch.service.js';
import { logAudit } from './audit.service.js';

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

export async function proposeDraftSupplier(draftId, userId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new ApiError(404, 'Draft not found');
    if (draft.mappedSupplierId) throw new ApiError(400, 'Supplier already mapped');
    const ex = draft.extractedData || {};
    const pending = buildPendingSupplierPayload(ex, draft.companyId, draft.financialYear);
    const existing = (draft.pendingMasters || []).find((p) => p.type === 'supplier' && p.status === 'pending');
    if (existing) {
        existing.payload = pending.payload;
    } else {
        draft.pendingMasters = [...(draft.pendingMasters || []), pending];
    }
    draft.status = 'needs_review';
    await draft.save();
    await logAudit(draftId, 'draft_supplier_proposed', userId, null, pending.payload);
    return draft;
}

export async function approvePendingMaster(draftId, masterIndex, userId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new ApiError(404, 'Draft not found');
    const entry = draft.pendingMasters?.[masterIndex];
    if (!entry || entry.status !== 'pending') throw new ApiError(400, 'No pending master at this index');

    if (entry.type === 'supplier') {
        const p = entry.payload || {};
        const supplierCode = await generateSupplierCode();
        const supplier = await Supplier.create({
            supplierCode,
            supplierName: p.supplierName || `Supplier ${p.gstNumber || supplierCode}`,
            gstNumber: p.gstNumber || '',
            panNumber: p.panNumber || '',
            gstType: 'CGST / SGST',
            state: p.state || '',
            address: p.address || '',
            isActive: true,
            createdBy: userId || null,
            remarks: p.source || 'Approved from AI Smart Import',
        });
        const ledgerId = await ensureSupplierLedger(supplier);
        if (ledgerId) {
            await Supplier.findByIdAndUpdate(supplier._id, { ledgerId });
        }
        entry.status = 'approved';
        entry.approvedEntityId = supplier._id;
        entry.approvedAt = new Date();
        entry.approvedBy = userId;
        draft.mappedSupplierId = supplier._id;
        draft.pendingMasters[masterIndex] = entry;
        await draft.save();
        await logAudit(draftId, 'draft_supplier_approved', userId, null, { supplierId: supplier._id });
        return draft;
    }

    throw new ApiError(400, `Unsupported pending master type: ${entry.type}`);
}
