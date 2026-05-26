import PDFDocument from 'pdfkit';
import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Company } from '../models/company.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import * as tdsService from '../services/tds.service.js';
import * as tdsChallanService from '../services/tdsChallan.service.js';
import * as tdsItns281 from '../services/tdsItns281.service.js';
import * as tdsMaster from '../services/tdsMaster.service.js';
import {
    previewPurchasePaymentTds,
    previewExpenseVoucherTds,
    previewPurchaseInvoiceTds,
    normalizeMongoRefId,
} from '../services/tdsDecisionEngine.service.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import * as tdsThreshold from '../services/tdsThreshold.service.js';
import * as tdsReports from '../services/tdsReports.service.js';
import * as tdsPayableLedger from '../services/tdsPayableLedger.service.js';
import logger from '../utils/logger.js';

export const getDashboard = asyncHandler(async (req, res) => {
    const data = await tdsService.getDashboardSummary(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, data, 'TDS dashboard'));
});

export const getDeductions = asyncHandler(async (req, res) => {
    const rows = await tdsService.listDeductions(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'TDS deductions'));
});

export const getDeductionRegister = asyncHandler(async (req, res) => {
    const rows = await tdsService.listTdsDeductionRegister(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'TDS deduction register'));
});

export const postDeduction = asyncHandler(async (req, res) => {
    const row = await tdsService.createDeduction(req.body, req.user?._id);
    res.status(201).json(new ApiResponse(201, row, 'TDS deduction created'));
});

export const postDeductionFromPayment = asyncHandler(async (req, res) => {
    const paymentEntryId = req.body.paymentEntryId;
    const { paymentEntryId: _p, ...overrides } = req.body;
    const row = await tdsService.createDeductionFromPaymentEntry(paymentEntryId, overrides, req.user?._id);
    const already = row._alreadyLinked === true;
    const status = already ? 200 : 201;
    if (already) delete row._alreadyLinked;
    res.status(status).json(new ApiResponse(status, row, already ? 'TDS row already exists for this payment' : 'TDS row created from payment'));
});

export const patchDeduction = asyncHandler(async (req, res) => {
    const row = await tdsService.updateDeduction(req.params.id, req.body);
    res.status(200).json(new ApiResponse(200, row, 'TDS deduction updated'));
});

export const removeDeduction = asyncHandler(async (req, res) => {
    const out = await tdsService.deleteDeduction(req.params.id);
    res.status(200).json(new ApiResponse(200, out, 'Deleted'));
});

export const getChallans = asyncHandler(async (req, res) => {
    const rows = await tdsService.listChallans();
    res.status(200).json(new ApiResponse(200, rows, 'TDS challans'));
});

export const getUnpaidTdsForChallan = asyncHandler(async (req, res) => {
    const rows = await tdsService.listUnpaidTdsForChallan(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Unpaid TDS for challan'));
});

export const postChallan = asyncHandler(async (req, res) => {
    const row = await tdsService.createChallan(req.body, req.user?._id, req.companyId);
    res.status(201).json(new ApiResponse(201, row, 'Challan created'));
});

export const getChallanRegister = asyncHandler(async (req, res) => {
    const rows = await tdsChallanService.listChallanRegister(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Challan register'));
});

export const getChallanById = asyncHandler(async (req, res) => {
    const row = await tdsChallanService.getChallanDetail(req.params.id);
    res.status(200).json(new ApiResponse(200, row, 'Challan detail'));
});

export const postChallanMarkPaid = asyncHandler(async (req, res) => {
    const row = await tdsChallanService.markChallanPaid(req.params.id, req.body, req.user?._id, req.companyId);
    res.status(200).json(new ApiResponse(200, row, 'Challan marked paid'));
});

export const getChallanEPayUrl = asyncHandler(async (req, res) => {
    res.status(200).json(
        new ApiResponse(
            200,
            { url: tdsChallanService.getIncomeTaxEPayTaxUrl() },
            'Income Tax e-Pay Tax portal URL',
        ),
    );
});

export const getChallanPdf = asyncHandler(async (req, res) => {
    const { challan, company } = await tdsChallanService.getChallanPdfContext(req.params.id, req.companyId);
    const variant = String(req.query.variant || 'official').toLowerCase();
    const isClient = variant === 'client';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `inline; filename="TDS-Challan-${challan.challanNo || challan._id}-${variant}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const title = isClient ? 'TDS Payment Request (Client Copy)' : 'TDS Challan (ITNS 281) — CRM Copy';
    doc.fontSize(14).text(title, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(company?.companyName || company?.legalName || 'Company');
    doc.text(`TAN: ${company?.tanNumber || '—'}  |  PAN: ${company?.panNumber || '—'}`);
    doc.text(`${company?.address || ''} ${company?.city || ''} ${company?.state || ''} ${company?.pincode || ''}`.trim());
    doc.moveDown();
    doc.text(`CRM Challan No.: ${challan.challanNo || '—'}`);
    doc.text(`Financial Year: ${challan.displayFinancialYear || challan.financialYear || '—'}`);
    doc.text(`Assessment Year: ${challan.displayAssessmentYear || challan.assessmentYear || '—'}`);
    doc.text(`Quarter: ${challan.primaryQuarter || '—'}`);
    doc.text(`Challan date: ${challan.challanDate ? new Date(challan.challanDate).toLocaleDateString('en-IN') : '—'}`);
    doc.text(`Status: ${challan.status || '—'}`);
    doc.moveDown();
    doc.text(`BSR: ${challan.bsrCode || '—'}  |  Serial: ${challan.challanSerial || '—'}  |  CIN: ${challan.cinNumber || '—'}`);
    doc.text(`Bank: ${challan.bankName || '—'}  |  Payment mode: ${challan.paymentMode || '—'}`);
    doc.moveDown();
    doc.text(`Total TDS (lines): ₹${Number(challan.totalTdsAmount || 0).toFixed(2)}`);
    doc.text(`Amount deposited: ₹${Number(challan.amountDeposited || 0).toFixed(2)}`);
    doc.text(`Balance: ₹${Number(challan.balanceAmount || 0).toFixed(2)}`);
    doc.moveDown();
    doc.text('Section-wise summary', { underline: true });
    (challan.sectionWiseSummary || []).forEach((s) => {
        doc.text(
            `${s.section}: Taxable ₹${Number(s.taxableTotal || 0).toFixed(2)} | TDS ₹${Number(s.tdsTotal || 0).toFixed(2)} | Pay ₹${Number(s.paidTotal || 0).toFixed(2)}`,
        );
    });
    doc.moveDown();
    doc.text('Deductee / voucher lines', { underline: true });
    (challan.lineItems || []).forEach((li, i) => {
        doc.text(
            `${i + 1}. ${li.voucherNo || '—'} | ${li.supplierName || '—'} | ${li.section} | Pay ₹${Number(li.payAmount || 0).toFixed(2)}`,
        );
    });
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#555').text(
        isClient
            ? 'Please arrange TDS payment on the Income Tax e-Pay Tax portal. This is not a government challan receipt.'
            : 'Prepared by CRM for internal use. Official receipt is on the Income Tax portal after payment.',
        { width: 480 },
    );
    doc.end();
});

export const getChallanItns281 = asyncHandler(async (req, res) => {
    const ctx = await tdsItns281.buildItns281FromChallan(
        req.params.id,
        req.companyId,
        req.query.financialYear,
        req.body,
    );
    res.status(200).json(new ApiResponse(200, ctx, 'ITNS 281 bank challan'));
});

export const postChallanItns281Preview = asyncHandler(async (req, res) => {
    let ctx;
    if (req.body?.challanId) {
        ctx = await tdsItns281.buildItns281FromChallan(
            req.body.challanId,
            req.companyId,
            req.body.financialYear,
            req.body,
        );
    } else {
        ctx = await tdsItns281.buildItns281FromDraft(req.companyId, req.body);
    }
    res.status(200).json(new ApiResponse(200, ctx, 'ITNS 281 bank challan preview'));
});

export const getChallanItns281Pdf = asyncHandler(async (req, res) => {
    const ctx = await tdsItns281.buildItns281FromChallan(
        req.params.id,
        req.companyId,
        req.query.financialYear,
        {},
    );
    const buf = await tdsItns281.createItns281PdfBuffer(ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `inline; filename="Bank-Challan-ITNS-281-${ctx.section || 'TDS'}.pdf"`,
    );
    res.send(buf);
});

export const postChallanItns281Pdf = asyncHandler(async (req, res) => {
    let ctx;
    if (req.body?.challanId) {
        ctx = await tdsItns281.buildItns281FromChallan(
            req.body.challanId,
            req.companyId,
            req.body.financialYear,
            req.body,
        );
    } else {
        ctx = await tdsItns281.buildItns281FromDraft(req.companyId, req.body);
    }
    const buf = await tdsItns281.createItns281PdfBuffer(ctx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `inline; filename="Bank-Challan-ITNS-281-${ctx.section || 'TDS'}.pdf"`,
    );
    res.send(buf);
});

export const postChallanLink = asyncHandler(async (req, res) => {
    const out = await tdsService.linkDeductionsToChallan(req.params.id, req.body.deductionIds);
    res.status(200).json(new ApiResponse(200, out, 'Linked'));
});

export const postReturnPreview = asyncHandler(async (req, res) => {
    const data = await tdsService.previewReturn(req.body);
    res.status(200).json(new ApiResponse(200, data, 'Return preview'));
});

export const postReturnExport = asyncHandler(async (req, res) => {
    const data = await tdsService.exportReturn({ ...req.body, userId: req.user?._id });
    res.status(200).json(new ApiResponse(200, data, 'Return export'));
});

export const getReturns = asyncHandler(async (req, res) => {
    const rows = await tdsService.listReturns();
    res.status(200).json(new ApiResponse(200, rows, 'TDS returns'));
});

export const postForm16aIssue = asyncHandler(async (req, res) => {
    const cert = await tdsService.issueForm16a({ ...req.body, userId: req.user?._id });
    res.status(201).json(new ApiResponse(201, cert, 'Form 16A issued'));
});

export const getForm16aList = asyncHandler(async (req, res) => {
    const rows = await tdsService.listForm16a();
    res.status(200).json(new ApiResponse(200, rows, 'Form 16A list'));
});

export const getForm16aPdf = asyncHandler(async (req, res) => {
    const { certificate, deductions } = await tdsService.getForm16aPdfData(req.params.id);
    const company = await Company.findById(req.companyId).lean();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Form16A-${certificate.supplierName || 'vendor'}-${certificate.quarter}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(14).text('Form 16A (TDS certificate) — format simulation', { underline: true });
    doc.moveDown();
    doc.fontSize(10).text('Deductor (Company)', { continued: false });
    doc.text(company?.companyName || company?.legalName || '—');
    doc.text(`PAN: ${company?.panNumber || '—'}  |  GSTIN: ${company?.gstNumber || '—'}`);
    doc.text(`${company?.address || ''} ${company?.city || ''} ${company?.state || ''} ${company?.pincode || ''}`);
    doc.moveDown();
    doc.text('Deductee (Vendor)');
    doc.text(certificate.supplierName || '—');
    doc.text(`PAN: ${certificate.deducteePan}`);
    doc.moveDown();
    doc.text(`Financial Year: ${certificate.financialYear}   Assessment Year: ${certificate.assessmentYear || '—'}   Quarter: ${certificate.quarter}`);
    doc.text(`Total amount paid (as per TDS rows): ${certificate.totalAmountPaid.toFixed(2)}`);
    doc.text(`Total TDS deducted: ${certificate.totalTdsDeducted.toFixed(2)}`);
    doc.moveDown();
    doc.text('Line details', { underline: true });
    deductions.forEach((d, i) => {
        doc.text(
            `${i + 1}. ${new Date(d.paymentDate).toLocaleDateString('en-IN')} | ${d.section} | Paid ${Number(d.amountPaid).toFixed(2)} | TDS ${Number(d.tdsAmount).toFixed(2)}`,
        );
    });
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#555').text('This PDF is generated from internal ERP data for business use only. Official filing uses TRACES / government portals.', {
        width: 480,
    });

    doc.end();
});

export const getTdsMasterSections = asyncHandler(async (req, res) => {
    const rows = await tdsMaster.listMasterSections();
    res.status(200).json(new ApiResponse(200, rows, 'TDS master sections'));
});

export const getTdsMasterSectionByCode = asyncHandler(async (req, res) => {
    const row = await tdsPayableLedger.getMasterSectionDetail(req.params.sectionCode);
    if (!row) throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
    res.status(200).json(new ApiResponse(200, row, 'TDS master section'));
});

export const getTdsPayableLedgerSuggestion = asyncHandler(async (req, res) => {
    const data = await tdsPayableLedger.getSuggestedPayableName(req.params.sectionCode);
    res.status(200).json(new ApiResponse(200, data, 'Default TDS payable ledger name'));
});

export const postTdsSectionPayableLedger = asyncHandler(async (req, res) => {
    const b = req.body || {};
    const out = await tdsPayableLedger.createOrMapSectionPayableLedger({
        sectionCode: req.params.sectionCode,
        ledgerName: b.ledgerName,
        printName: b.printName,
        status: b.status,
        mapExistingLedgerId: normalizeMongoRefId(b.mapExistingLedgerId),
        userId: req.user?._id,
    });
    res.status(200).json(new ApiResponse(200, out, 'TDS payable ledger'));
});

export const patchTdsMasterSection = asyncHandler(async (req, res) => {
    const row = await tdsMaster.updateMasterSection(req.params.sectionCode, req.body, req.user?._id);
    if (!row) throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
    res.status(200).json(new ApiResponse(200, row, 'Section updated'));
});

export const getTdsSettings = asyncHandler(async (req, res) => {
    const data = await tdsThreshold.getTdsSettings();
    res.status(200).json(new ApiResponse(200, data, 'TDS settings'));
});

export const patchTdsSettings = asyncHandler(async (req, res) => {
    const data = await tdsThreshold.updateTdsSettings(req.body, req.user?._id);
    res.status(200).json(new ApiResponse(200, data, 'TDS settings updated'));
});

export const getThresholdTrackingReport = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.getThresholdTrackingReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Threshold tracking'));
});

export const getVendorWiseTdsSummary = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.getVendorWiseSummary(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Vendor-wise TDS summary'));
});

export const getPendingTdsDeductionReport = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.getPendingDeductionReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Pending TDS deductions'));
});

export const getNearLimitReport = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.getNearLimitReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Near limit alerts'));
});

export const getDeductedNotPaidReport = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.getDeductedNotPaidReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'TDS deducted not paid'));
});

export const getTdsExceptionReport = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.getExceptionReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'TDS exceptions'));
});

export const getTdsAuditLogs = asyncHandler(async (req, res) => {
    const rows = await tdsThreshold.listAuditLogs(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'TDS audit log'));
});

export const getPayableReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getPayableReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'TDS payable report'));
});

export const getSectionWiseReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getSectionWiseSummary(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Section-wise TDS summary'));
});

export const getDeducteeWiseReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getDeducteeWiseSummary(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Deductee-wise TDS summary'));
});

export const getPanMissingReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getPanMissingReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'PAN missing report'));
});

export const getMonthlyLiabilityReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getMonthlyLiabilityReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Monthly TDS liability'));
});

export const getQuarterWiseReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getQuarterWiseSummary(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Quarter-wise TDS summary'));
});

export const getLowerDeductionReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getLowerDeductionCertificateReport();
    res.status(200).json(new ApiResponse(200, rows, 'Lower deduction certificates'));
});

export const getChallanReconciliationReport = asyncHandler(async (req, res) => {
    const rows = await tdsReports.getChallanReconciliationReport(req.query.financialYear);
    res.status(200).json(new ApiResponse(200, rows, 'Challan reconciliation'));
});

export const postPaymentTdsPreview = asyncHandler(async (req, res) => {
    const { invoiceId, amountPaid, tdsBaseAmount, excludePaymentEntryId, paymentDate } = req.body;
    if (!invoiceId) throw new ApiError(400, 'invoiceId is required');
    const ap = Number(amountPaid);
    if (!(ap > 0)) throw new ApiError(400, 'amountPaid must be > 0');

    const inv = await PurchaseInvoice.findById(invoiceId)
        .select(
            'supplierId financialYear invoiceDate grandTotal totalTaxableAmount totalTax totalCgst totalSgst totalIgst freightTotalGst roundOff',
        )
        .lean();
    if (!inv) throw new ApiError(404, 'Invoice not found');
    const supplierId = inv.supplierId;
    if (!supplierId) throw new ApiError(400, 'Invoice has no supplier');

    const fy =
        inv.financialYear ||
        getFYFromDate(paymentDate ? new Date(paymentDate) : new Date(inv.invoiceDate || Date.now()));

    const invoiceSnapshot = {
        grandTotal: inv.grandTotal,
        totalTaxableAmount: inv.totalTaxableAmount,
        totalTax: inv.totalTax,
        totalCgst: inv.totalCgst,
        totalSgst: inv.totalSgst,
        totalIgst: inv.totalIgst,
        freightTotalGst: inv.freightTotalGst,
        roundOff: inv.roundOff,
    };

    const out = await previewPurchasePaymentTds({
        supplierId,
        financialYear: fy,
        amountPaid: ap,
        tdsBaseAmount: Number(tdsBaseAmount || 0),
        excludePaymentEntryId: excludePaymentEntryId || undefined,
        invoiceSnapshot,
    });
    res.status(200).json(new ApiResponse(200, out, 'TDS preview'));
});

/** Body mirrors expense save payload: partyId, date, items, isGstEnabled, grand/totals; optional financialYear, excludeVoucherId */
export const postExpenseVoucherTdsPreview = asyncHandler(async (req, res) => {
    const b = req.body || {};
    const partyLedgerId = normalizeMongoRefId(b.partyLedgerId || b.partyId);
    if (!partyLedgerId) throw new ApiError(400, 'partyId (supplier ledger) is required for expense TDS preview');

    const fy =
        (b.financialYear && String(b.financialYear).trim()) ||
        getFYFromDate(b.date ? new Date(b.date) : new Date());

    const processingTotal =
        Number(b.processingTotal || b.grandTotal || b.totalAmount || 0) || 0;

    const t0 = Date.now();
    const out = await previewExpenseVoucherTds({
        partyLedgerId,
        financialYear: fy,
        items: Array.isArray(b.items) ? b.items : [],
        isGstEnabled: Boolean(b.isGstEnabled),
        processingTotal,
        voucherTaxSnapshot: {
            totalTaxableAmount: b.totalTaxableAmount,
            totalTax: b.totalTax,
            totalCgst: b.totalCgst,
            totalSgst: b.totalSgst,
            totalIgst: b.totalIgst,
            roundOff: b.roundOff,
        },
        excludeVoucherId: b.excludeVoucherId || undefined,
        expenseTdsSectionResolution: b.expenseTdsSectionResolution || undefined,
        voucherDate: b.date ? new Date(b.date) : null,
    });
    const ms = Date.now() - t0;
    logger.info(
        `[tds] expense-voucher/preview ${ms}ms previewFailed=${Boolean(out.previewFailed)} partyLedger=${partyLedgerId}`,
    );
    res.status(200).json(new ApiResponse(200, out, 'Expense voucher TDS preview'));
});

export const postPurchaseInvoiceTdsPreview = asyncHandler(async (req, res) => {
    const { supplierId, excludePurchaseInvoiceId, invoiceDate, financialYear } = req.body || {};
    if (!supplierId) throw new ApiError(400, 'supplierId is required');

    const snap = req.body.invoiceSnapshot || req.body;
    const gt = Number(snap.grandTotal || 0);
    if (!(gt > 0)) throw new ApiError(400, 'grandTotal (or invoiceSnapshot.grandTotal) must be > 0');

    const fy =
        (financialYear && String(financialYear).trim()) ||
        getFYFromDate(invoiceDate ? new Date(invoiceDate) : new Date());

    const invoiceSnapshot = {
        grandTotal: gt,
        totalTaxableAmount: snap.totalTaxableAmount,
        totalTax: snap.totalTax,
        totalCgst: snap.totalCgst,
        totalSgst: snap.totalSgst,
        totalIgst: snap.totalIgst,
        freightTotalGst: snap.freightTotalGst,
        roundOff: snap.roundOff,
    };

    const out = await previewPurchaseInvoiceTds({
        supplierId,
        financialYear: fy,
        invoiceSnapshot,
        excludePurchaseInvoiceId: excludePurchaseInvoiceId || undefined,
        billDate: invoiceDate ? new Date(invoiceDate) : null,
    });
    res.status(200).json(new ApiResponse(200, out, 'Purchase invoice TDS preview'));
});
