import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@/components/ui';
import { Download, Calendar as CalendarIcon, RefreshCw, AlertCircle, FileText, IndianRupee } from 'lucide-react';
import apiClient from '@/config/apiClient';
import { formatCurrency, formatDate } from '@/utils/formatters';
import * as XLSX from 'xlsx';

const TABS = [
    { id: 'all', label: 'All Inward GST Bills' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'expenses_services', label: 'Expenses & Services' },
    { id: 'fixed_assets', label: 'Fixed Assets' },
    { id: 'reverse_charge', label: 'Reverse Charge' },
    { id: 'imports', label: 'Imports' },
    { id: 'credit_debit_notes', label: 'Credit / Debit Notes' },
    { id: 'eligible_itc', label: 'Eligible ITC' },
    { id: 'ineligible_blocked', label: 'Ineligible / Blocked' },
    { id: 'books_vs_2b', label: 'Books vs GSTR-2B' },
];

const FY_2026_27 = { startDate: '2026-04-01', endDate: '2027-03-31' };

function eligibilityBadgeVariant(status) {
    if (status === 'Eligible' || status === 'RCM ITC Available') return 'success';
    if (/Ineligible|Blocked|Time-Barred/i.test(status || '')) return 'destructive';
    return 'warning';
}

/** UI display label only — does not alter voucherType / sourceModule on the row. */
function resolveDocumentType(row) {
    if (!row) return '';
    if (row.purchaseType === 'GSTR-2B Only' || row.sourceModule === 'GSTR-2B Import') {
        return 'GSTR-2B Only';
    }
    if (row.rcmApplicable || row.documentCategory === 'reverse_charge') {
        return 'Reverse Charge';
    }
    if (row.documentCategory === 'imports' || /import of goods|bill.?of.?entry/i.test(String(row.purchaseType || row.remarks || ''))) {
        if (/service/i.test(String(row.purchaseType || row.remarks || ''))) return 'Import of Services';
        return 'Import of Goods';
    }
    if (/credit note/i.test(String(row.purchaseType || '')) || /credit note/i.test(String(row.voucherType || ''))) {
        return 'Purchase Credit Note';
    }
    if (/debit note/i.test(String(row.purchaseType || '')) || /debit note/i.test(String(row.voucherType || ''))) {
        return 'Purchase Debit Note';
    }
    if (row.sourceModule === 'Fixed Assets' || row.voucherType === 'Fixed Asset Purchase' || row.documentCategory === 'fixed_assets') {
        return 'Fixed Asset Purchase';
    }
    if (row.sourceModule === 'Expense Voucher' || row.sourceModule === 'Expense' || row.documentCategory === 'expenses_services') {
        return 'Expense Voucher';
    }
    if (row.sourceModule === 'Purchase' || /purchase invoice/i.test(String(row.voucherType || ''))) {
        return 'Purchase Invoice';
    }
    return row.voucherType || row.sourceModule || '';
}

export const ItcRegisterPage = () => {
    const navigate = useNavigate();
    const [payload, setPayload] = useState({ rows: [], summary: {}, meta: {} });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');
    const [dateRange, setDateRange] = useState({ ...FY_2026_27 });
    const [filters, setFilters] = useState({
        supplier: '',
        gstin: '',
        gstType: 'All',
        itcEligibility: 'All',
        purchaseType: 'All',
        missingGstinOnly: false,
    });

    const data = payload.rows || [];
    const summary = payload.summary || {};

    const fetchRegister = async (tab = activeTab) => {
        setLoading(true);
        try {
            const res = await apiClient.get('/gst-reports/itc-register', {
                params: { ...dateRange, ...filters, tab },
            });
            if (res.data.success) {
                const body = res.data.data;
                // Support both new object shape and legacy array
                if (Array.isArray(body)) {
                    setPayload({ rows: body, summary: {}, meta: {} });
                } else {
                    setPayload({
                        rows: body?.rows || [],
                        summary: body?.summary || {},
                        meta: body?.meta || {},
                        title: body?.title,
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching GST Inward & ITC Register:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRegister('all');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        fetchRegister(tabId);
    };

    const handleExport = () => {
        const exportData = data.map((row) => ({
            Date: formatDate(row.date),
            'Document Type': resolveDocumentType(row),
            'Voucher Number': row.voucherNumber,
            'Source Module': row.sourceModule,
            'Supplier Name': row.supplierName,
            'Supplier GSTIN': row.supplierGstin || 'GSTIN Missing',
            'Invoice Number': row.invoiceNumber,
            'Invoice Date': formatDate(row.invoiceDate),
            'Expense/Purchase Ledger': row.expensePurchaseLedger,
            'Document Category': row.documentCategory,
            'Purchase Type': row.purchaseType,
            'Place of Supply': row.placeOfSupply,
            'Taxable Value': row.taxableValue,
            CGST: row.cgst,
            SGST: row.sgst,
            IGST: row.igst,
            Cess: row.cess,
            'Total GST': row.totalGst ?? row.totalTax,
            'Invoice Value': row.invoiceValue ?? row.totalInvoiceValue,
            'RCM Applicable': row.rcmApplicable ? 'Yes' : 'No',
            'RCM Evaluation Status': row.rcmEvaluationStatus || '—',
            'RCM Confirmation Status': row.rcmConfirmationStatus || '—',
            'RCM Taxable Value (preview)': row.rcmTaxableValue ?? '',
            'RCM CGST (preview)': row.rcmCgst ?? '',
            'RCM SGST (preview)': row.rcmSgst ?? '',
            'RCM IGST (preview)': row.rcmIgst ?? '',
            'Liability Posting Status': row.liabilityPostingStatus || 'NOT_POSTED',
            'Liability Voucher': row.rcmLiabilityVoucherNumber || '',
            'RCM Total Liability': row.rcmTotalLiability ?? '',
            'RCM Amount Paid': row.rcmAmountPaid ?? '',
            'RCM Outstanding': row.rcmOutstanding ?? '',
            'Tax Payment Status': row.rcmTaxPaymentStatus || row.taxPaymentStatus || '—',
            'Challan Reference': row.rcmChallanReference || '',
            'Payment Date': row.rcmPaymentDate || '',
            'ITC Availability Status': row.itcAvailabilityStatus || 'Pending Eligibility Review',
            'GSTR-3B Mapping Status': row.gstr3bMappingStatus || 'Not Automatically Updated',
            'Self-Invoice Status': row.selfInvoiceStatus || '—',
            'GSTR-3B Preview Section': row.gstr3bPreviewSection || 'Preview only — not in return',
            'ITC Eligibility': row.itcEligibility,
            'Ineligibility Reason': row.ineligibilityReason,
            'GSTR-2B Status': row.gstr2bStatus,
            'Reconciliation Status': row.reconciliationStatus,
            'Accounting Posting Status': row.accountingPostingStatus,
            'Payment Status': row.paymentStatus,
            Remarks: row.remarks,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'GST_Inward_ITC');
        XLSX.writeFile(wb, `GST_Inward_ITC_${dateRange.startDate}_to_${dateRange.endDate}.xlsx`);
    };

    const columns = useMemo(() => [
        { header: 'Date', accessor: (row) => formatDate(row.date), thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Document Type', accessor: (row) => resolveDocumentType(row), thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Voucher No', accessor: 'voucherNumber', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Supplier', accessor: 'supplierName', thClass: 'min-w-[180px]', tdClass: 'min-w-[180px] max-w-[260px]' },
        {
            header: 'GSTIN',
            accessor: (row) => (row.supplierGstin
                ? row.supplierGstin
                : <Badge variant="destructive">Missing</Badge>),
            thClass: 'min-w-[140px]',
            tdClass: 'min-w-[140px] whitespace-nowrap',
        },
        { header: 'Invoice No', accessor: 'invoiceNumber', thClass: 'min-w-[140px]', tdClass: 'min-w-[140px]' },
        { header: 'Invoice Date', accessor: (row) => formatDate(row.invoiceDate), thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Ledger', accessor: 'expensePurchaseLedger', thClass: 'min-w-[160px]', tdClass: 'min-w-[160px] max-w-[240px]' },
        { header: 'Category', accessor: 'documentCategory', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Purchase Type', accessor: 'purchaseType', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'POS', accessor: 'placeOfSupply', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Taxable', accessor: (row) => formatCurrency(row.taxableValue), className: 'text-right', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap text-right' },
        { header: 'CGST', accessor: (row) => formatCurrency(row.cgst), className: 'text-right', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap text-right' },
        { header: 'SGST', accessor: (row) => formatCurrency(row.sgst), className: 'text-right', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap text-right' },
        { header: 'IGST', accessor: (row) => formatCurrency(row.igst), className: 'text-right', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap text-right' },
        { header: 'Cess', accessor: (row) => formatCurrency(row.cess || 0), className: 'text-right', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap text-right' },
        {
            header: 'Total GST',
            accessor: (row) => (
                <span className="font-semibold text-blue-600">
                    {formatCurrency(row.totalGst ?? row.totalTax)}
                </span>
            ),
            className: 'text-right',
            thClass: 'whitespace-nowrap',
            tdClass: 'whitespace-nowrap text-right',
        },
        { header: 'Invoice Value', accessor: (row) => formatCurrency(row.invoiceValue ?? row.totalInvoiceValue), className: 'text-right', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap text-right' },
        { header: 'RCM', accessor: (row) => (row.rcmApplicable ? 'Yes' : 'No'), thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        {
            header: 'RCM Eval',
            accessor: (row) => row.rcmEvaluationStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Confirm',
            accessor: (row) => row.rcmConfirmationStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Taxable*',
            accessor: (row) => (row.rcmTaxableValue != null ? formatCurrency(row.rcmTaxableValue) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'RCM CGST*',
            accessor: (row) => (row.rcmCgst != null ? formatCurrency(row.rcmCgst) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'RCM SGST*',
            accessor: (row) => (row.rcmSgst != null ? formatCurrency(row.rcmSgst) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'RCM IGST*',
            accessor: (row) => (row.rcmIgst != null ? formatCurrency(row.rcmIgst) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'Liab. Post*',
            accessor: (row) => row.liabilityPostingStatus || 'NOT_POSTED',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Liab. Voucher*',
            accessor: (row) => row.rcmLiabilityVoucherNumber || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Liab. Total*',
            accessor: (row) => (row.rcmTotalLiability != null ? formatCurrency(row.rcmTotalLiability) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'RCM Amt Paid*',
            accessor: (row) => (row.rcmAmountPaid != null ? formatCurrency(row.rcmAmountPaid) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'RCM Outstanding*',
            accessor: (row) => (row.rcmOutstanding != null ? formatCurrency(row.rcmOutstanding) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'RCM Tax Pay*',
            accessor: (row) => row.rcmTaxPaymentStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Challan Ref*',
            accessor: (row) => row.rcmChallanReference || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Pay Date*',
            accessor: (row) => (row.rcmPaymentDate ? String(row.rcmPaymentDate).slice(0, 10) : '—'),
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'ITC Avail*',
            accessor: (row) => row.itcAvailabilityStatus || 'Pending Eligibility Review',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'ITC Eligibility*',
            accessor: (row) => row.itcEligibilityDecision || row.itcEligibility || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'ITC Eligible Amt*',
            accessor: (row) => (row.itcEligibleAmount != null ? formatCurrency(row.itcEligibleAmount) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'ITC Inelig/Block*',
            accessor: (row) => (row.itcIneligibleAmount != null ? formatCurrency(row.itcIneligibleAmount) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'ITC Released*',
            accessor: (row) => (row.itcReleasedAmount != null ? formatCurrency(row.itcReleasedAmount) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'ITC Reversed*',
            accessor: (row) => (row.itcReversedAmount != null ? formatCurrency(row.itcReversedAmount) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'ITC Remaining*',
            accessor: (row) => (row.itcRemainingAmount != null ? formatCurrency(row.itcRemainingAmount) : '—'),
            className: 'text-right',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-right text-amber-900 text-xs',
        },
        {
            header: 'ITC Rel. Voucher*',
            accessor: (row) => row.itcReleaseVoucherNumber || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'ITC Reviewer*',
            accessor: (row) => row.itcReviewer || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'ITC Review Date*',
            accessor: (row) => (row.itcReviewDate ? String(row.itcReviewDate).slice(0, 10) : '—'),
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'GSTR-3B Map*',
            accessor: (row) => row.gstr3bMappingStatus || 'Not Automatically Updated',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Liab Period*',
            accessor: (row) => row.rcmLiabilityReturnPeriod || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Liab Return*',
            accessor: (row) => row.rcmLiabilityReturnStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM ITC Return*',
            accessor: (row) => row.rcmItcReturnStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: '3B Batch*',
            accessor: (row) => row.gstr3bInclusionBatch || (row.gstr3bBatchVersion != null ? `v${row.gstr3bBatchVersion}` : '—'),
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Exception*',
            accessor: (row) => row.rcmExceptionStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'RCM Approval*',
            accessor: (row) => row.rcmApprovalStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Filed Period*',
            accessor: (row) => row.rcmFiledPeriod || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Amendment?*',
            accessor: (row) => (row.rcmAmendmentRequired ? 'Yes' : '—'),
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Recon Diff*',
            accessor: (row) => row.rcmReconciliationDifference || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'Self-Inv*',
            accessor: (row) => row.selfInvoiceStatus || '—',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: '3B Preview*',
            accessor: (row) => row.gstr3bPreviewSection || 'Not in return',
            thClass: 'whitespace-nowrap text-amber-800',
            tdClass: 'whitespace-nowrap text-amber-900 text-xs',
        },
        {
            header: 'ITC Eligibility',
            accessor: (row) => (
                <Badge variant={eligibilityBadgeVariant(row.itcEligibility)}>{row.itcEligibility}</Badge>
            ),
            thClass: 'whitespace-nowrap',
            tdClass: 'whitespace-nowrap',
        },
        { header: 'Inelig. Reason', accessor: 'ineligibilityReason' },
        { header: 'GSTR-2B', accessor: 'gstr2bStatus', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Recon', accessor: 'reconciliationStatus', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Posting', accessor: 'accountingPostingStatus', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Payment', accessor: 'paymentStatus', thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
        { header: 'Remarks', accessor: 'remarks' },
    ], []);

    const footTotals = data.reduce((acc, row) => {
        acc.taxableValue += row.taxableValue || 0;
        acc.cgst += row.cgst || 0;
        acc.sgst += row.sgst || 0;
        acc.igst += row.igst || 0;
        acc.totalTax += row.totalGst || row.totalTax || 0;
        return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 });

    const handleRowClick = (row) => {
        if (!row?.id) return;
        if (row.sourceModule === 'Purchase') {
            navigate(`/purchase/purchase-invoice/${row.id}`);
        } else if (
            row.sourceModule === 'Expense Voucher'
            || row.sourceModule === 'Expense'
            || row.sourceModule === 'Accounts'
            || row.sourceModule === 'RCM Liability'
        ) {
            navigate(`/accounts/vouchers/${row.liabilityJvId || row.id}`);
        } else if (row.sourceModule === 'Fixed Assets') {
            navigate(`/fixed-assets/${row.id}`);
        }
    };

    const SummaryCard = ({ title, value, icon, colorClass }) => (
        <div className={`p-3 rounded-lg border bg-white flex items-center gap-3 shadow-sm ${colorClass}`}>
            <div className="p-2 rounded-full bg-slate-50 text-slate-600 shrink-0">{icon}</div>
            <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase truncate">{title}</p>
                <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-4 pb-12">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
                <div className="flex flex-col lg:flex-row justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-800">GST Inward &amp; ITC Register</h1>
                        <p className="text-xs text-slate-500">
                            Reporting &amp; reconciliation only — does not alter vouchers, ledgers, stock, or GST returns.
                        </p>
                        <p className="text-xs text-amber-700 mt-1 font-medium">
                            RCM Preview / Posted Liability — Simulated amounts never enter claimable ITC. Posted RCM liability shows Payment Pending and ITC Not Available until later phases. GSTR-3B totals are not auto-updated.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDateRange({ ...FY_2026_27 })}
                        >
                            FY 2026-27
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => fetchRegister(activeTab)} disabled={loading} icon={RefreshCw}>
                            Apply Filters
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleExport} disabled={data.length === 0} icon={Download}>
                            Export Excel
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 border rounded-md px-2 bg-slate-50">
                        <CalendarIcon size={16} className="text-slate-500" />
                        <input
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange((p) => ({ ...p, startDate: e.target.value }))}
                            className="bg-transparent px-1 py-1.5 text-sm focus:outline-none"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange((p) => ({ ...p, endDate: e.target.value }))}
                            className="bg-transparent px-1 py-1.5 text-sm focus:outline-none"
                        />
                    </div>

                    <input
                        type="text"
                        placeholder="Search Supplier..."
                        value={filters.supplier}
                        onChange={(e) => setFilters((p) => ({ ...p, supplier: e.target.value }))}
                        className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-40"
                    />
                    <input
                        type="text"
                        placeholder="GSTIN..."
                        value={filters.gstin}
                        onChange={(e) => setFilters((p) => ({ ...p, gstin: e.target.value }))}
                        className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-32"
                    />
                    <select
                        value={filters.gstType}
                        onChange={(e) => setFilters((p) => ({ ...p, gstType: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                    >
                        <option value="All">All GST Types</option>
                        <option value="CGST/SGST">Local (CGST/SGST)</option>
                        <option value="IGST">Interstate (IGST)</option>
                    </select>
                    <select
                        value={filters.purchaseType}
                        onChange={(e) => setFilters((p) => ({ ...p, purchaseType: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                    >
                        <option value="All">All Types</option>
                        <option value="Raw Material">Raw Material</option>
                        <option value="Trading Purchase">Trading</option>
                        <option value="Consumable">Consumable</option>
                        <option value="Service Purchase">Service Purchase</option>
                        <option value="Capital Purchase">Capital Purchase</option>
                        <option value="Expense">Expense</option>
                    </select>
                    <select
                        value={filters.itcEligibility}
                        onChange={(e) => setFilters((p) => ({ ...p, itcEligibility: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                    >
                        <option value="All">All Eligibility</option>
                        <option value="Eligible">Eligible</option>
                        <option value="Ineligible">Ineligible</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Reverse Charge">Reverse Charge</option>
                        <option value="Pending">Pending / Review</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={filters.missingGstinOnly}
                            onChange={(e) => setFilters((p) => ({ ...p, missingGstinOnly: e.target.checked }))}
                            className="rounded border-slate-300"
                        />
                        Missing GSTIN Only
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <SummaryCard title="Inward Taxable" value={formatCurrency(summary.totalInwardTaxable || 0)} icon={<IndianRupee size={18} />} colorClass="border-blue-200" />
                <SummaryCard title="Total GST (Inward Documents)" value={formatCurrency(summary.totalGstInwardDocuments ?? summary.totalGstBooks ?? 0)} icon={<FileText size={18} />} colorClass="border-teal-200" />
                <SummaryCard title="Input GST Posted (Ledgers)" value={formatCurrency(summary.inputGstLedgerTotal || 0)} icon={<FileText size={18} />} colorClass="border-slate-300" />
                <SummaryCard title="GST Document vs Accounting Posting Difference" value={formatCurrency(summary.documentVsPostingDifference || 0)} icon={<AlertCircle size={18} />} colorClass="border-amber-300" />
                <SummaryCard title="Eligible ITC (approved only)" value={formatCurrency(summary.eligibleItc || 0)} icon={<IndianRupee size={18} />} colorClass="border-emerald-200" />
                <SummaryCard title="Ineligible / Blocked" value={formatCurrency(summary.ineligibleBlockedItc || 0)} icon={<AlertCircle size={18} />} colorClass="border-red-200" />
                <SummaryCard title="GST as per GSTR-2B" value={formatCurrency(summary.totalGstGstr2b || 0)} icon={<FileText size={18} />} colorClass="border-indigo-200" />
                <SummaryCard title="Temporarily Reversed" value={formatCurrency(summary.temporarilyReversed || 0)} icon={<RefreshCw size={18} />} colorClass="border-amber-200" />
                <SummaryCard title="RCM Liability" value={formatCurrency(summary.rcmLiability || 0)} icon={<FileText size={18} />} colorClass="border-orange-200" />
                <SummaryCard title="RCM ITC Available" value={formatCurrency(summary.rcmItcAvailable || 0)} icon={<IndianRupee size={18} />} colorClass="border-lime-200" />
                <SummaryCard title="Books Not in 2B" value={formatCurrency(summary.booksNotIn2b || 0)} icon={<AlertCircle size={18} />} colorClass="border-rose-200" />
                <SummaryCard title="2B Not in Books" value={formatCurrency(summary.gstr2bNotInBooks || 0)} icon={<AlertCircle size={18} />} colorClass="border-fuchsia-200" />
                <SummaryCard title="Books vs 2B Difference" value={formatCurrency(summary.reconciliationDifference || 0)} icon={<FileText size={18} />} colorClass="border-violet-200" />
                <SummaryCard title="Missing GSTIN" value={summary.missingGstin || 0} icon={<AlertCircle size={18} />} colorClass="border-red-300" />
            </div>

            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Total GST on inward documents is <strong>not</strong> claimable ITC. Use <strong>Eligible ITC (approved only)</strong> for claimable amounts.
                Document total and Input GST ledger posting are tracked separately; their gap is shown as GST Document vs Accounting Posting Difference.
                Columns marked * are RCM Phase 2B-A preview only — simulated amounts are not included in accounting totals or GSTR-3B.
            </p>

            {summary.counts && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Purchase: <strong>{summary.counts.purchase || 0}</strong></span>
                    <span>Expense: <strong>{summary.counts.expense || 0}</strong></span>
                    <span>Fixed Asset: <strong>{summary.counts.fixedAsset || 0}</strong></span>
                    <span>RCM: <strong>{summary.counts.rcm || 0}</strong></span>
                    <span>Imports: <strong>{summary.counts.imports || 0}</strong></span>
                    <span>CDN: <strong>{summary.counts.notes || 0}</strong></span>
                    <span>2B Only: <strong>{summary.counts.portalOnly || 0}</strong></span>
                    <span>Total rows: <strong>{summary.counts.total || 0}</strong></span>
                </div>
            )}

            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleTabChange(tab.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                            activeTab === tab.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[1680px]">
                        <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                            <tr>
                                {columns.map((col, idx) => (
                                    <th key={idx} className={`px-3 py-2 ${col.thClass || ''} ${col.className || ''}`}>{col.header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length} className="text-center py-8 text-slate-500">Loading inward GST data...</td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="text-center py-8 text-slate-500">No inward GST records for the selected filters.</td>
                                </tr>
                            ) : (
                                data.map((row, idx) => (
                                    <tr
                                        key={`${row.id || idx}-${row.sourceModule || ''}`}
                                        onClick={() => handleRowClick(row)}
                                        className={`border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors ${!row.supplierGstin ? 'bg-red-50/50' : ''}`}
                                    >
                                        {columns.map((col, colIdx) => (
                                            <td key={colIdx} className={`px-3 py-2 ${col.tdClass || ''} ${col.className || ''}`}>
                                                {typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {!loading && data.length > 0 && (
                            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={11} className="px-3 py-2 text-right">Totals (rows: {data.length}):</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(footTotals.taxableValue)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(footTotals.cgst)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(footTotals.sgst)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(footTotals.igst)}</td>
                                    <td className="px-3 py-2" />
                                    <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(footTotals.totalTax)}</td>
                                    <td colSpan={9} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default ItcRegisterPage;
