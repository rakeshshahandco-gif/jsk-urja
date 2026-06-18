import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { Supplier } from '../../models/supplier.model.js';
import { CompanyProfile } from '../../models/companyProfile.model.js';
import { isLedgerOnlyPurchase } from './postingMode.util.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function validateGstTotals(ex) {
    const errors = [];
    const taxable = Number(ex.taxableAmount) || 0;
    const cgst = Number(ex.cgst) || 0;
    const sgst = Number(ex.sgst) || 0;
    const igst = Number(ex.igst) || 0;
    const cess = Number(ex.cess) || 0;
    const roundOff = Number(ex.roundOff) || 0;
    const freight = Number(ex.freight) || 0;
    const otherCharges = Number(ex.otherCharges) || 0;
    const grandTotal = Number(ex.grandTotal) || 0;

    const hasTaxBreakup = taxable > 0 || cgst > 0 || sgst > 0 || igst > 0;
    if (!hasTaxBreakup && grandTotal > 0) {
        errors.push('GST warning: tax breakup missing — enter taxable and GST manually');
        return errors;
    }

    const computed = r2(taxable + cgst + sgst + igst + cess + roundOff + freight + otherCharges);
    if (grandTotal > 0 && Math.abs(computed - grandTotal) > 1) {
        errors.push(`GST mismatch: taxable + taxes + round off (${computed}) does not match grand total (${grandTotal})`);
    }

    const hasIntra = cgst > 0 || sgst > 0;
    const hasInter = igst > 0;
    if (hasIntra && hasInter) {
        errors.push('GST mismatch: both CGST/SGST and IGST cannot apply together');
    }
    if (hasIntra && cgst > 0 && sgst > 0 && Math.abs(cgst - sgst) > 0.02) {
        errors.push('GST mismatch: CGST and SGST should normally be equal');
    }

    return errors;
}

export async function validateDraft(draftId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) return null;
    const ex = draft.extractedData || {};
    const errors = [];

    const invNo = ex.supplierInvoiceNo || ex.invoiceNo || ex.billNo || '';
    const invDate = ex.invoiceDate || ex.billDate;
    const amount = Number(ex.grandTotal) || Number(ex.taxableAmount) || 0;

    if (!invNo) errors.push('Invoice / bill number is required');
    if (!invDate) errors.push('Invoice / bill date is required');
    if (amount <= 0) errors.push('Amount is required');
    if (draft.moduleType === 'purchase_invoice' && !String(ex.supplierName || '').trim()) {
        errors.push('Supplier name is required');
    }
    if (draft.moduleType === 'purchase_invoice' && !String(ex.supplierGstin || '').trim()) {
        errors.push('Supplier GSTIN is required');
    }
    if (!draft.uploadFileUrl && !draft.storedFileName) errors.push('Attachment is required');

    const pendingSupplier = (draft.pendingMasters || []).some((p) => p.type === 'supplier' && p.status === 'pending');
    if (pendingSupplier) errors.push('Draft supplier must be approved before posting');

    if (draft.moduleType === 'purchase_invoice') {
        if (!draft.mappedSupplierId) errors.push('Supplier must be mapped before posting');
        const ledgerOnly = isLedgerOnlyPurchase(draft);
        if (!ledgerOnly && (!draft.mappedItems?.length || draft.mappedItems.some((m) => !m.itemId))) {
            errors.push('All stock items must be mapped before posting');
        }
        if (ledgerOnly && !(Number(ex.taxableAmount) > 0 || Number(ex.grandTotal) > 0)) {
            errors.push('Taxable amount is required for ledger-only purchase');
        }
    }
    if (draft.moduleType === 'sales_invoice') {
        if (!draft.mappedCustomerId) errors.push('Customer must be mapped before posting');
        if (!draft.mappedItems?.length || draft.mappedItems.some((m) => !m.itemId)) {
            errors.push('All items must be mapped before posting');
        }
    }
    if (draft.moduleType === 'expense_bill') {
        if (!draft.mappedLedgerId) errors.push('Expense account head must be selected');
        if (!ex.voucherTypeId) errors.push('Expense voucher type is required');
        if (!ex.cashBankAccountId) errors.push('Cash/Bank account is required');
    }

    errors.push(...validateGstTotals(ex));

    try {
        const company = await CompanyProfile.findOne().sort({ updatedAt: -1 }).lean();
        const buyerStateCode = company?.gstNumber?.substring(0, 2) || '';
        if (draft.moduleType === 'purchase_invoice' && draft.mappedSupplierId) {
            const supplier = await Supplier.findById(draft.mappedSupplierId).select('gstNumber').lean();
            const supState = supplier?.gstNumber?.substring(0, 2) || '';
            const sameState = buyerStateCode && supState && buyerStateCode === supState;
            const hasIntra = Number(ex.cgst || 0) > 0 || Number(ex.sgst || 0) > 0;
            const hasInter = Number(ex.igst || 0) > 0;
            if (sameState && hasInter && !hasIntra) {
                errors.push('GST mismatch: same-state supplier should use CGST + SGST, not IGST only');
            }
            if (!sameState && buyerStateCode && supState && hasIntra && !hasInter) {
                errors.push('GST mismatch: different-state supplier should use IGST, not CGST/SGST');
            }
            if (!sameState && buyerStateCode && supState && ex.gstType === 'CGST / SGST' && hasIntra) {
                errors.push('GST warning: inter-state supplier but CGST/SGST selected');
            }
        }
    } catch { /* non-blocking company lookup */ }

    draft.validationErrors = errors;
    const hasBlocker = errors.some((e) => !e.startsWith('GST warning:'));
    if (hasBlocker && draft.status !== 'posted' && draft.status !== 'rejected') {
        draft.status = 'needs_review';
    } else if (!hasBlocker && draft.status === 'needs_review') {
        const stillUnresolved =
            (draft.moduleType === 'purchase_invoice' && !draft.mappedSupplierId) ||
            (draft.moduleType === 'sales_invoice' && !draft.mappedCustomerId) ||
            (draft.moduleType === 'expense_bill' && !draft.mappedLedgerId) ||
            (!isLedgerOnlyPurchase(draft) && (draft.mappedItems || []).some((m) => !m.itemId));
        if (!stillUnresolved) draft.status = 'ready_to_post';
    }
    await draft.save();
    return draft;
}
