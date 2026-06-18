import fs from 'fs';
import path from 'path';
import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { Supplier } from '../../models/supplier.model.js';
import Customer from '../../models/customer.model.js';
import { Item } from '../../models/item.model.js';
import { VoucherAttachment } from '../../models/voucherAttachment.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { createPurchaseInvoice } from '../../controllers/purchaseInvoice.controller.js';
import { createSalesInvoice } from '../../controllers/salesInvoice.controller.js';
import { createVoucher } from '../../controllers/voucher.controller.js';
import { validateDraft } from './validation.service.js';
import { checkDuplicate } from './duplicateCheck.service.js';
import { logAudit } from './audit.service.js';
import { SCAN_ENTRY_UPLOAD_DIR } from '../../middlewares/scanEntryUpload.middleware.js';
import { isLedgerOnlyPurchase } from './postingMode.util.js';
import { ensureSupplierLedger } from './masterMatch.service.js';
import { PurchaseInvoice } from '../../models/purchaseInvoice.model.js';
import { Voucher } from '../../models/voucher.model.js';
import { postPurchaseInvoiceToLedger, reverseInvoiceLedgerImpact } from '../../utils/ledgerDispatcher.js';
import mongoose from 'mongoose';

async function invokeController(handler, body, user) {
    return new Promise((resolve, reject) => {
        const req = { body, user: { _id: user._id || user.id, id: user.id || user._id }, query: {} };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { return this.statusCode >= 400 ? reject(new ApiError(this.statusCode, payload?.message || 'Post failed')) : resolve(payload?.data ?? payload); },
            send(payload) { return this.json(payload); },
        };
        Promise.resolve(handler(req, res, (err) => reject(err))).catch(reject);
    });
}

async function linkScanFileToVoucher(draft, voucherType, voucherId, meta = {}) {
    if (!draft.storedFileName || !draft.uploadFileUrl) return null;
    const srcPath = path.join(SCAN_ENTRY_UPLOAD_DIR, draft.storedFileName);
    if (!fs.existsSync(srcPath)) return null;
    const attachDir = 'uploads/voucher-attachments/';
    if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });
    const ext = path.extname(draft.storedFileName) || path.extname(draft.originalFileName) || '';
    const destName = 'attachment-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    fs.copyFileSync(srcPath, path.join(attachDir, destName));
    return VoucherAttachment.create({
        voucherType, voucherId,
        voucherNumber: meta.voucherNumber || '', partyName: meta.partyName || '', billNo: meta.billNo || '', amount: meta.amount || 0, voucherDate: meta.voucherDate || null,
        fileName: destName, originalName: draft.originalFileName || destName, mimeType: draft.mimeType || '', fileUrl: '/uploads/voucher-attachments/' + destName, fileSize: draft.fileSize || 0,
        source: 'scan', label: 'Scan Entry import', uploadedBy: draft.postedBy,
    });
}

function inferGstRateFromExtract(ex) {
    const taxable = Number(ex.taxableAmount) || 0;
    const igst = Number(ex.igst) || 0;
    const cgst = Number(ex.cgst) || 0;
    const sgst = Number(ex.sgst) || 0;
    const tax = igst || cgst + sgst;
    if (taxable > 0 && tax > 0) {
        const pct = Math.round((tax / taxable) * 100);
        if ([0, 5, 12, 18, 28].includes(pct)) return pct;
        return Math.round(pct);
    }
    return 18;
}

async function resolveLedgerOnlyPurchaseItem() {
    let item = await Item.findOne({ itemCode: 'SCAN-LEDGER-PUR', isDeleted: { $ne: true } }).lean();
    if (!item) {
        item = await Item.findOne({ itemCategory: 'CONSUMABLE', isDeleted: { $ne: true } })
            .sort({ itemName: 1 })
            .lean();
    }
    if (!item) {
        throw new ApiError(
            400,
            'Ledger-only purchase needs a consumable item. Create item code SCAN-LEDGER-PUR (category CONSUMABLE) in Inventory.',
        );
    }
    return item;
}

function buildPurchasePayload(draft, supplier) {
    const ex = draft.extractedData || {};
    const items = (draft.mappedItems || []).filter((m) => m.itemId).map((m) => ({
        itemId: String(m.itemId), itemCode: m.itemCode || '', itemName: m.itemName || '', hsnCode: m.hsnCode || '', uom: m.uom || 'NOS',
        qty: Number(m.qty) || 0, rate: Number(m.rate) || 0, discountPercent: Number(m.discountPercent) || 0, gstRate: Number(m.gstRate) || 18,
        description: '', purchaseType: m.purchaseType || 'RAW_MATERIAL_PURCHASE', isConsumable: false,
        allocation: { type: 'General', referenceId: null, referenceName: '', typeModel: null },
    }));
    if (!items.length) throw new ApiError(400, 'No mapped items to post');
    const addr = [supplier.address, supplier.area, supplier.city, supplier.state, supplier.pincode].filter(Boolean).join(', ');
    return {
        flowType: 'Direct Invoice', supplierId: String(draft.mappedSupplierId), invoiceDate: ex.invoiceDate || new Date(),
        supplierInvoiceNo: ex.supplierInvoiceNo || ex.invoiceNo || '', supplierGstin: supplier.gstNumber || ex.supplierGstin || '',
        supplierAddress: addr, supplierState: supplier.state || '', supplierStateCode: supplier.gstNumber ? supplier.gstNumber.substring(0, 2) : '',
        gstType: ex.gstType || 'CGST / SGST', placeOfSupply: ex.placeOfSupply || supplier.state || '', remarks: draft.userRemarks || 'Posted from Scan Entry',
        freightAmount: Number(ex.freightAmount || ex.freight) || 0, freightGstRate: 0, items, isConsumable: false,
        tdsUserConfirmed: false, tdsPopupSkipped: true,
    };
}

async function buildLedgerOnlyPurchasePayload(draft, supplier) {
    const ex = draft.extractedData || {};
    const genericItem = await resolveLedgerOnlyPurchaseItem();
    const taxable = Number(ex.taxableAmount) || 0;
    const grandTotal = Number(ex.grandTotal) || 0;
    const lineAmount = taxable > 0 ? taxable : Math.max(0, grandTotal - Number(ex.igst || 0) - Number(ex.cgst || 0) - Number(ex.sgst || 0) - Number(ex.freight || ex.freightAmount || 0));
    if (lineAmount <= 0) throw new ApiError(400, 'Taxable amount is required for ledger-only purchase posting');

    const gstRate = inferGstRateFromExtract(ex);
    const narration = [
        ex.supplierInvoiceNo || ex.invoiceNo || '',
        ex.supplierName || supplier.supplierName || '',
        'Ledger-only scan import',
    ].filter(Boolean).join(' | ');

    const items = [{
        itemId: String(genericItem._id),
        itemCode: genericItem.itemCode || '',
        itemName: genericItem.itemName || 'Purchase (Ledger Only)',
        description: narration,
        hsnCode: genericItem.hsnCode || ex.items?.[0]?.hsnCode || '998898',
        uom: genericItem.uom || 'NOS',
        qty: 1,
        rate: lineAmount,
        discountPercent: 0,
        gstRate,
        isConsumable: true,
        purchaseType: 'CONSUMABLE_PURCHASE',
        allocation: { type: 'General', referenceId: null, referenceName: '', typeModel: null },
    }];

    const addr = [supplier.address, supplier.area, supplier.city, supplier.state, supplier.pincode].filter(Boolean).join(', ');
    return {
        flowType: 'Direct Invoice',
        supplierId: String(draft.mappedSupplierId),
        invoiceDate: ex.invoiceDate || new Date(),
        supplierInvoiceNo: ex.supplierInvoiceNo || ex.invoiceNo || '',
        supplierGstin: supplier.gstNumber || ex.supplierGstin || '',
        supplierAddress: addr,
        supplierState: supplier.state || '',
        supplierStateCode: supplier.gstNumber ? supplier.gstNumber.substring(0, 2) : '',
        gstType: ex.gstType || (Number(ex.igst) > 0 ? 'IGST' : 'CGST / SGST'),
        placeOfSupply: ex.placeOfSupply || supplier.state || '',
        remarks: draft.userRemarks || 'Ledger-only purchase from Scan Entry (no inventory)',
        freightAmount: Number(ex.freightAmount || ex.freight) || 0,
        freightGstRate: 0,
        items,
        isConsumable: true,
        tdsUserConfirmed: false,
        tdsPopupSkipped: true,
    };
}

function buildSalesPayload(draft, customer) {
    const ex = draft.extractedData || {};
    const items = (draft.mappedItems || []).filter((m) => m.itemId).map((m) => ({
        itemId: String(m.itemId), itemCode: m.itemCode || '', itemName: m.itemName || '', hsnCode: m.hsnCode || '', uom: m.uom || 'NOS',
        qty: Number(m.qty) || 0, rate: Number(m.rate) || 0, discountPercent: Number(m.discountPercent) || 0, gstRate: Number(m.gstRate) || 18,
    }));
    return {
        customerId: String(draft.mappedCustomerId), customerName: customer.customerName || ex.customerName || '', invoiceDate: ex.invoiceDate || new Date(),
        poNumber: ex.poNumber || '', gstType: ex.gstType || 'CGST / SGST', items, status: 'Confirmed', financialYear: draft.financialYear, remarks: draft.userRemarks || 'Posted from Scan Entry',
    };
}

function buildExpensePayload(draft) {
    const ex = draft.extractedData || {};
    if (!ex.voucherTypeId) throw new ApiError(400, 'Expense voucher type is required — set on review screen');
    if (!ex.cashBankAccountId) throw new ApiError(400, 'Cash/Bank account is required — set on review screen');
    const amount = Number(ex.grandTotal) || Number(ex.taxableAmount) || 0;
    return {
        nature: 'Expense', voucherTypeId: ex.voucherTypeId, cashBankAccountId: ex.cashBankAccountId, date: ex.billDate || ex.invoiceDate || new Date(),
        narration: ex.narration || ex.vendorName || 'Expense from scan', totalAmount: amount, financialYear: draft.financialYear,
        isGstEnabled: !!(ex.cgst || ex.sgst || ex.igst), gstType: ex.gstType || 'CGST / SGST',
        items: [{ ledgerId: String(draft.mappedLedgerId), amount, type: 'Debit', narration: ex.narration || '' }],
        tdsUserConfirmed: false, tdsPopupSkipped: true,
    };
}

export async function repostPurchaseInvoiceLedger(invoiceId, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const inv = await PurchaseInvoice.findById(invoiceId).session(session);
        if (!inv) throw new ApiError(404, 'Purchase invoice not found');
        if (inv.isDeleted || inv.status === 'Cancelled') {
            throw new ApiError(400, 'Cannot post ledger for a cancelled/deleted invoice');
        }
        const supplier = inv.supplierId ? await Supplier.findById(inv.supplierId).session(session) : null;
        if (supplier) await ensureSupplierLedger(supplier);
        await reverseInvoiceLedgerImpact(inv.invoiceNumber, session);
        const voucherId = await postPurchaseInvoiceToLedger(inv, userId, session);
        await session.commitTransaction();
        return { invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, voucherId };
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

async function ensurePurchaseInvoiceLedgerPosted(invoice, userId) {
    if (!invoice?.invoiceNumber) return null;
    const existing = await Voucher.findOne({ voucherNo: invoice.invoiceNumber, nature: 'Purchase' }).lean();
    if (existing) return existing._id;
    return repostPurchaseInvoiceLedger(invoice._id, userId);
}

export async function postDraft(draftId, user) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new ApiError(404, 'Draft not found');
    if (draft.status === 'posted') throw new ApiError(400, 'Draft already posted');
    await validateDraft(draftId); await checkDuplicate(draftId);
    const refreshed = await ScanEntryDraft.findById(draftId);
    if (refreshed.duplicateCheckResult?.isDuplicate && !refreshed.adminOverrideReason) throw new ApiError(409, 'Duplicate invoice detected. Admin override required.');
    if (refreshed.validationErrors?.some((e) => !e.startsWith('GST warning:'))) {
        throw new ApiError(400, refreshed.validationErrors.filter((e) => !e.startsWith('GST warning:')).join('; '));
    }

    let linkedId = null; let voucherType = null; let meta = {};
    if (refreshed.moduleType === 'purchase_invoice') {
        const supplier = await Supplier.findById(refreshed.mappedSupplierId);
        if (!supplier) throw new ApiError(400, 'Mapped supplier not found');
        await ensureSupplierLedger(supplier);
        const payload = isLedgerOnlyPurchase(refreshed)
            ? await buildLedgerOnlyPurchasePayload(refreshed, supplier)
            : buildPurchasePayload(refreshed, supplier);
        const invoice = await invokeController(createPurchaseInvoice, payload, user);
        try {
            await ensurePurchaseInvoiceLedgerPosted(invoice, user.id || user._id);
        } catch (ledgerErr) {
            throw new ApiError(400, ledgerErr.message || 'Purchase saved but ledger posting failed');
        }
        linkedId = invoice._id; voucherType = 'purchase_invoice';
        meta = { voucherNumber: invoice.invoiceNumber, partyName: invoice.supplierName || supplier.supplierName, billNo: invoice.supplierInvoiceNo, amount: invoice.grandTotal, voucherDate: invoice.invoiceDate };
        refreshed.finalLinkedInvoiceId = linkedId;
    } else if (refreshed.moduleType === 'sales_invoice') {
        const customer = await Customer.findById(refreshed.mappedCustomerId);
        if (!customer) throw new ApiError(400, 'Mapped customer not found');
        const invoice = await invokeController(createSalesInvoice, buildSalesPayload(refreshed, customer), user);
        linkedId = invoice._id; voucherType = 'sales_invoice';
        meta = { voucherNumber: invoice.invoiceNumber || invoice.displayInvoiceNumber, partyName: customer.customerName, amount: invoice.grandTotal, voucherDate: invoice.invoiceDate };
        refreshed.finalLinkedInvoiceId = linkedId;
    } else if (refreshed.moduleType === 'expense_bill') {
        const voucher = await invokeController(createVoucher, buildExpensePayload(refreshed), user);
        linkedId = voucher._id; voucherType = 'expense_voucher';
        meta = { voucherNumber: voucher.voucherNo, partyName: refreshed.extractedData?.vendorName || '', billNo: refreshed.extractedData?.billNo || '', amount: voucher.totalAmount, voucherDate: voucher.date };
        refreshed.finalLinkedVoucherId = linkedId;
    } else throw new ApiError(400, 'Unsupported module type');

    refreshed.postedBy = user.id || user._id; refreshed.status = 'posted'; await refreshed.save();
    await linkScanFileToVoucher(refreshed, voucherType, linkedId, meta);
    await logAudit(draftId, 'post', user.id || user._id, null, { linkedId, voucherType });
    return { draft: refreshed, linkedId, voucherType };
}

export async function saveDraftOnly(draftId, patch, userId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new ApiError(404, 'Draft not found');
    if (patch.extractedData !== undefined) draft.extractedData = { ...draft.extractedData, ...patch.extractedData };
    if (patch.userRemarks !== undefined) draft.userRemarks = patch.userRemarks;
    if (patch.assignedTo !== undefined) draft.assignedTo = patch.assignedTo;
    if (patch.mappedSupplierId !== undefined) draft.mappedSupplierId = patch.mappedSupplierId;
    if (patch.mappedCustomerId !== undefined) draft.mappedCustomerId = patch.mappedCustomerId;
    if (patch.mappedLedgerId !== undefined) draft.mappedLedgerId = patch.mappedLedgerId;
    if (patch.mappedItems !== undefined) draft.mappedItems = patch.mappedItems;
    draft.reviewedBy = userId; if (draft.status !== 'posted' && draft.status !== 'rejected') draft.status = 'needs_review';
    await draft.save(); await validateDraft(draftId); await checkDuplicate(draftId); await logAudit(draftId, 'save_draft', userId);
    return ScanEntryDraft.findById(draftId);
}

export async function rejectDraft(draftId, remark, userId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new ApiError(404, 'Draft not found');
    draft.status = 'rejected'; draft.userRemarks = remark || ''; draft.reviewedBy = userId;
    await draft.save(); await logAudit(draftId, 'reject', userId, null, { remark }); return draft;
}

export async function softDeleteDraft(draftId, userId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) throw new ApiError(404, 'Draft not found');
    draft.deletedAt = new Date(); await draft.save(); await logAudit(draftId, 'delete', userId); return draft;
}

export async function listItemsForMapping(search = '') {
    const q = { isDeleted: { $ne: true } };
    if (search) q.$or = [{ itemName: new RegExp(search, 'i') }, { itemCode: new RegExp(search, 'i') }];
    return Item.find(q).select('itemName itemCode hsnCode uom').limit(50).lean();
}

