import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
    getSalesInvoiceById, cancelSalesInvoice, deleteSalesInvoice, 
    restoreSalesInvoice, recordSalesPayment, renumberInvoice, 
    changeInvoiceSeries, getInvoiceSeries 
} from '@/services/salesApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';
import { createEwayBillDraft } from '@/services/ewayBillApi';
import { createEInvoiceDraft } from '@/services/eInvoiceApi';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import communicationApi from '@/services/communicationApi';
import CommunicationModal from '@/components/communication/CommunicationModal';
import GstCorrectionModal from './components/GstCorrectionModal';
import SalesInvoiceCancelDeleteModal from './components/SalesInvoiceCancelDeleteModal';
import InvoiceBarcodeBlock from '@/components/invoice/InvoiceBarcodeBlock';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { getBillAdjustments } from '@/services/billWiseAdjustmentApi';

const PAY_COLORS = {
    Unpaid: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Partially Paid': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Paid: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#6b7280', bg: '#f9fafb', border: '#e2e8f0' },
};
const th = { padding: '9px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };
const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };

export default function SalesInvoiceDetailPage() {
    const { hasRole, hasPermission } = useAuth();
    const { isFeatureEnabled } = useFeatureSettings();
    const isAdmin = hasRole('admin') || hasRole('superadmin');
    const canCancelInvoice = hasPermission('sales.sales_invoices.cancel');
    const canDeleteInvoice = hasPermission('sales.sales_invoices.delete');
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('invoice');
    const [cancelling, setCancelling] = useState(false);
    const [cancelDeleteModal, setCancelDeleteModal] = useState(null);
    const [seriesList, setSeriesList] = useState([]);
    const [showSeriesModal, setShowSeriesModal] = useState(false);
    const [showGstModal, setShowGstModal] = useState(false);
    const [isCommModalOpen, setIsCommModalOpen] = useState(false);
    const [billWiseRows, setBillWiseRows] = useState([]);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getSalesInvoiceById(id),
            getCompanyProfile().catch(() => ({ data: {} }))
        ]).then(([invRes, companyRes]) => {
            setInv(invRes);
            setCompany(companyRes?.data || {});
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    const handleSendComm = async (payload) => {
        try {
            await communicationApi.sendOrder({
                ...payload,
                id: inv._id,
                type: 'Sales Invoice'
            });
            // Statuses are handled inside modal via socket
        } catch (error) {
            toast.error('Failed to initiate communication');
            throw error;
        }
    };

    useEffect(() => { 
        load(); 
        getInvoiceSeries({ active: true }).then(setSeriesList).catch(() => {});
    }, [load]);

    useEffect(() => {
        if (!id) return;
        getBillAdjustments({ billId: id, billType: 'SalesInvoice' })
            .then((rows) => setBillWiseRows(Array.isArray(rows) ? rows : []))
            .catch(() => setBillWiseRows([]));
    }, [id]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const handleCancelDeleteConfirm = async (payload) => {
        setCancelling(true);
        try {
            if (cancelDeleteModal === 'cancel') {
                const res = await cancelSalesInvoice(id, payload);
                toast.success(res.message || 'Invoice cancelled. Number reserved.');
                setCancelDeleteModal(null);
                load();
            } else {
                const res = await deleteSalesInvoice(id, payload);
                toast.success(res.message || 'Invoice deleted and number freed.');
                setCancelDeleteModal(null);
                navigate(PATHS.SALES.INVOICES);
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Action failed');
        } finally {
            setCancelling(false);
        }
    };

    const handleRenumber = async () => {
        const newNum = window.prompt('Enter NEW display invoice number:', inv.displayInvoiceNumber || inv.invoiceNumber);
        const reason = window.prompt('Reason for renumbering:');
        if (newNum && reason) {
            const reflow = window.confirm('REFLOW SEQUENCE?\n\nWould you like the system to automatically re-calculate and update ALL FOLLOWING invoices in this series to maintain a perfect sequence?');
            
            setLoading(true);
            try {
                const res = await renumberInvoice(id, { 
                    newDisplayNumber: newNum, 
                    reason, 
                    reflowRemaining: reflow 
                });
                toast.success(res.message || 'Renumbered!');
                load();
            } catch (e) {
                toast.error(e.response?.data?.message || 'Failed to renumber');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleChangeSeries = async (targetId) => {
        if (!targetId) return;
        const reason = window.prompt('Reason for moving to this series:');
        if (reason === null) return;
        
        setLoading(true);
        try {
            await changeInvoiceSeries(id, { targetSeriesId: targetId, reason });
            toast.success('Series changed successfully!');
            setShowSeriesModal(false);
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to change series');
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!window.confirm('Restore this invoice? This will deduct item stocks again.')) return;
        setLoading(true);
        try { await restoreSalesInvoice(id); toast.success('Invoice restored'); load(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setLoading(false); }
    };

    const handleEwayBill = async () => {
        setLoading(true);
        try {
            const res = await createEwayBillDraft(id);
            toast.success('E-Way Bill Draft Ready!');
            navigate(`/eway-bills/draft/${res.data._id}`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to prepare E-Way Bill');
        } finally {
            setLoading(false);
        }
    };

    const handleEInvoice = async () => {
        setLoading(true);
        try {
            const res = await createEInvoiceDraft(id);
            toast.success('E-Invoice Draft Ready!');
            navigate(`/e-invoices/draft/${res.data._id}`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to prepare E-Invoice');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <BrandedLoader size={120} />;
    if (!inv) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>Invoice not found.</div>;

    const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS.Unpaid;
    const isIGST = inv.gstType === 'IGST';
    const gstApplicable = inv.gstApplicable !== false;
    const isEstimate = inv.seriesId?.isEstimate === true || 
                       inv.seriesId?.seriesName?.toLowerCase().includes('estimate') ||
                       (inv.invoiceNumber || '').toLowerCase().includes('est');
    const notCancelled = inv.status !== 'Cancelled';
    const notFullyPaid = inv.paymentStatus !== 'Paid';

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* PRINT ONLY LAYOUT (PROFESSIONAL TAX INVOICE) */}
            <div className="print-only" style={{ display: 'none', width: '210mm', padding: 0, color: '#000', fontSize: '10pt' }}>
                {(() => {
                    const items = inv.items || [];
                    const itemsPerPageFirst = 8; 
                    const itemsPerPageOthers = 20; 
                    
                    const pages = [];
                    if (items.length <= itemsPerPageFirst) {
                        pages.push(items);
                    } else {
                        pages.push(items.slice(0, itemsPerPageFirst));
                        let remaining = items.slice(itemsPerPageFirst);
                        while (remaining.length > 0) {
                            pages.push(remaining.slice(0, itemsPerPageOthers));
                            remaining = remaining.slice(itemsPerPageOthers);
                        }
                    }

                    return pages.map((pageItems, pageIdx) => {
                        const isFirstPage = pageIdx === 0;
                        const isLastPage = pageIdx === pages.length - 1;
                        const totalPages = pages.length;

                        return (
                            <div key={pageIdx} className="print-page" style={{ 
                                padding: '10mm', 
                                minHeight: '275mm', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                background: '#fff', 
                                boxSizing: 'border-box',
                                pageBreakAfter: isLastPage ? 'auto' : 'always',
                                position: 'relative'
                            }}>
                                <div style={{ position: 'absolute', bottom: '5mm', right: '10mm', fontSize: '8pt', color: '#666' }}>
                                    Page {pageIdx + 1} of {totalPages}
                                </div>

                                {isFirstPage ? (
                                    <div style={{ border: '1px solid #000', padding: '10px', marginBottom: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                                                <img src="/logo.jpeg" alt="Logo" style={{ maxHeight: `${company.logoHeight || 75}px`, maxWidth: '160px', objectFit: 'contain' }} />
                                                <div>
                                                    <div style={{ fontSize: '18pt', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2px', color: '#000' }}>{company.companyName}</div>
                                                    <div style={{ fontSize: '8.5pt', lineHeight: '1.2', maxWidth: '450px' }}>
                                                        <div style={{ fontWeight: 600 }}>{company.address}</div>
                                                        <div>{company.city} - {company.pincode}, {company.state} (Code: {company.stateCode})</div>
                                                        <div>{company.phone && `Contact: ${company.phone}`} {company.email && ` | Email: ${company.email}`}</div>
                                                        <div style={{ marginTop: '3px', fontWeight: 600 }}>
                                                            {gstApplicable && company.gstNumber && <span>GSTIN: {company.gstNumber} | </span>}
                                                            {company.panNumber && <span>PAN: {company.panNumber}</span>}
                                                        </div>
                                                        {company.cin && <span>CIN: {company.cin} | </span>}
                                                        {company.urn && <span>MSME/URN: {company.urn}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', minWidth: '150px' }}>
                                                <div style={{ fontSize: '13pt', fontWeight: 900, color: '#000', border: '2px solid #000', padding: '4px 12px', display: 'inline-block', marginBottom: '8px', textTransform: 'uppercase' }}>
                                                    {gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE'}
                                                </div>
                                                <div style={{ fontSize: '10pt', fontWeight: 800 }}>Invoice No: {inv.invoiceNumber}</div>
                                                <div style={{ fontSize: '10pt', fontWeight: 700 }}>Date: {new Date(inv.invoiceDate).toLocaleDateString('en-GB')}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ border: '1px solid #000', padding: '10px', marginBottom: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '14pt', fontWeight: 900, textTransform: 'uppercase' }}>{company.companyName}</div>
                                            <div style={{ textAlign: 'right', fontSize: '9pt' }}>
                                                <strong>Invoice No:</strong> {inv.invoiceNumber} | <strong>Date:</strong> {new Date(inv.invoiceDate).toLocaleDateString('en-GB')}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isFirstPage && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', borderBottom: 'none' }}>
                                            <div style={{ borderRight: '1px solid #000', padding: '6px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                                                    <tbody>
                                                        <tr><td style={{ color: '#555', width: '110px' }}>Sales Order No:</td><td style={{ fontWeight: 700 }}>{inv.soNumber || '—'}</td></tr>
                                                        <tr><td style={{ color: '#555' }}>Buyer Order No:</td><td style={{ fontWeight: 700 }}>{inv.buyerOrderNo || '—'}</td></tr>
                                                        <tr><td style={{ color: '#555' }}>Dispatch Through:</td><td>{inv.dispatchThrough || '—'}</td></tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div style={{ padding: '6px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                                                    <tbody>
                                                        <tr><td style={{ color: '#555', width: '110px' }}>Place of Supply:</td><td style={{ fontWeight: 700 }}>{inv.placeOfSupply || inv.billingState || '—'}</td></tr>
                                                        <tr><td style={{ color: '#555' }}>Payment Term:</td><td>{inv.paymentTerms || '—'}</td></tr>
                                                        <tr><td style={{ color: '#555' }}>Buyer Order Date:</td><td>{inv.buyerOrderDate ? new Date(inv.buyerOrderDate).toLocaleDateString('en-GB') : '—'}</td></tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', borderBottom: 'none' }}>
                                            <div style={{ borderRight: '1px solid #000', padding: '8px' }}>
                                                <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Bill To (Buyer):</div>
                                                <div style={{ fontSize: '10pt', fontWeight: 900 }}>{inv.customerName}</div>
                                                <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap', marginBottom: '4px' }}>{inv.billingAddress}</div>
                                                <div style={{ fontSize: '8pt' }}>
                                                    {inv.customerGstin && <div><strong>GSTIN:</strong> {inv.customerGstin}</div>}
                                                    <div><strong>State:</strong> {inv.billingState} ({inv.billingStateCode})</div>
                                                </div>
                                            </div>
                                            <div style={{ padding: '8px' }}>
                                                <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Ship To (Consignee):</div>
                                                <div style={{ fontSize: '10pt', fontWeight: 900 }}>{inv.customerName}</div>
                                                <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap', marginBottom: '4px' }}>{inv.shippingAddress || inv.billingAddress}</div>
                                                <div style={{ fontSize: '8pt' }}>
                                                    {(inv.shippingGstin || inv.customerGstin) && <div><strong>GSTIN:</strong> {inv.shippingGstin || inv.customerGstin}</div>}
                                                    <div><strong>State:</strong> {inv.shippingState || inv.billingState} ({inv.shippingStateCode || inv.billingStateCode})</div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div style={{ flex: 1 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                                        <thead>
                                            <tr style={{ background: '#f5f5f5' }}>
                                                <th style={{ width: '35px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>SR</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '8pt', textAlign: 'left' }}>ITEM DESCRIPTION</th>
                                                <th style={{ width: '70px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>HSN/SAC</th>
                                                <th style={{ width: '45px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>UOM</th>
                                                <th style={{ width: '50px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>QTY</th>
                                                <th style={{ width: '90px', border: '1px solid #000', padding: '6px 4px', fontSize: '8pt', textAlign: 'right' }}>RATE</th>
                                                <th style={{ width: '100px', border: '1px solid #000', padding: '6px 4px', fontSize: '8pt', textAlign: 'right' }}>AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageItems.map((it, i) => {
                                                const srNo = (pageIdx === 0 ? 0 : itemsPerPageFirst + (pageIdx - 1) * itemsPerPageOthers) + i + 1;
                                                return (
                                                    <tr key={i} style={{ minHeight: '30px' }}>
                                                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontSize: '9pt' }}>{srNo}</td>
                                                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                                                            <div style={{ fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase' }}>{it.description || it.itemName}</div>
                                                            {(it.additionalNotes || it.itemCode) && (
                                                                <div style={{ fontSize: '8pt', color: '#444', marginTop: '2px' }}>
                                                                    {it.itemCode && <span>Code: {it.itemCode} </span>}
                                                                    {it.additionalNotes && <span>| {it.additionalNotes}</span>}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontSize: '9pt' }}>{it.hsnCode || '—'}</td>
                                                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontSize: '9pt' }}>{it.uom || 'NOS'}</td>
                                                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 700, fontSize: '9pt' }}>{it.qty}</td>
                                                        <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', fontSize: '9pt' }}>{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: '9pt' }}>{Number(it.taxableAmount || (it.qty * it.rate) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    </tr>
                                                );
                                            })}
                                            {!isLastPage && (
                                                <tr>
                                                    <td colSpan="7" style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontStyle: 'italic', fontSize: '9pt', background: '#fafafa' }}>
                                                        Continued on next page...
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {isLastPage && (
                                    <div style={{ marginTop: '10px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', border: '1px solid #000' }}>
                                            <div style={{ borderRight: '1px solid #000', padding: '8px' }}>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', borderBottom: '1px solid #eee', paddingBottom: '2px', marginBottom: '4px' }}>Remarks:</div>
                                                    <div style={{ fontSize: '9pt', color: '#333', whiteSpace: 'pre-wrap', fontStyle: inv.remarks ? 'normal' : 'italic' }}>
                                                        {inv.remarks || '—'}
                                                    </div>
                                                </div>
                                                <div style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', borderBottom: '1px solid #eee', paddingBottom: '2px', marginBottom: '4px' }}>Bank Details:</div>
                                                    <div style={{ fontSize: '8.5pt', lineHeight: '1.3' }}>
                                                        <strong>{company.bankName || 'BANK OF BARODA'}</strong><br />
                                                        Account Name: {company.companyName}<br />
                                                        Account No: {company.accountNo || '—'}<br />
                                                        IFSC Code: {company.ifscCode || '—'} | Branch: {company.branchName || '—'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', borderBottom: '1px solid #eee', paddingBottom: '2px', marginBottom: '4px' }}>Terms & Declaration:</div>
                                                    <div style={{ fontSize: '7.5pt', color: '#333', lineHeight: '1.2' }}>
                                                        1. Goods once sold will not be taken back.<br />
                                                        2. Subject to MUMBAI Jurisdiction.<br />
                                                        3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div style={{ padding: '0' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                                                    <tbody>
                                                         {!isEstimate && (
                                                            <>
                                                                <tr>
                                                                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>Total Item Value</td>
                                                                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹ {(inv.totalTaxableAmount - (inv.freightAmount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                                {Number(inv.freightAmount || 0) > 0 && (
                                                                    <tr>
                                                                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>+ Freight / Shipping</td>
                                                                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹ {Number(inv.freightAmount).toFixed(2)}</td>
                                                                    </tr>
                                                                )}
                                                            </>
                                                        )}
                                                        <tr>
                                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontWeight: 700 }}>{isEstimate ? 'Total Estimated Price' : 'Total Taxable Value'}</td>
                                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700 }}>₹ {(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                        {!isEstimate && gstApplicable && (
                                                            isIGST ? (
                                                                <tr>
                                                                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>+ IGST @ {inv.items?.[0]?.taxRate || 18}%</td>
                                                                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹ {(inv.totalIgst || inv.totalTaxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            ) : (
                                                                <>
                                                                    <tr>
                                                                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>+ CGST @ {(inv.items?.[0]?.taxRate || 18) / 2}%</td>
                                                                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹ {(inv.totalCgst || (inv.totalTaxAmount / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>+ SGST @ {(inv.items?.[0]?.taxRate || 18) / 2}%</td>
                                                                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹ {(inv.totalSgst || (inv.totalTaxAmount / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                    </tr>
                                                                </>
                                                            )
                                                        )}
                                                        {inv.roundOff !== 0 && (
                                                            <tr>
                                                                <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>Round Off</td>
                                                                <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{Number(inv.roundOff).toFixed(2)}</td>
                                                            </tr>
                                                        )}
                                                        <tr style={{ background: '#f5f5f5' }}>
                                                            <td style={{ padding: '6px 8px', fontWeight: 900, fontSize: '11pt' }}>Grand Total</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 900, fontSize: '11pt' }}>₹ {(inv.roundedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div style={{ border: '1px solid #000', borderTop: 'none', padding: '6px 8px', fontSize: '9pt', background: '#fafafa' }}>
                                            <span style={{ fontWeight: 800, textTransform: 'uppercase', marginRight: '5px' }}>Amount in Words:</span>
                                            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{inv.amountInWords}</span>
                                        </div>

                                        {isLastPage && <InvoiceBarcodeBlock invoiceId={id} variant="print" />}

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', borderTop: 'none', minHeight: '100px' }}>
                                            <div style={{ borderRight: '1px solid #000', padding: '8px', fontSize: '8pt', position: 'relative' }}>
                                                <div style={{ fontWeight: 900, marginBottom: '6px', textDecoration: 'underline' }}>Receiver&apos;s Signature:</div>
                                                <div style={{ position: 'absolute', bottom: '8px', left: '8px', fontSize: '7pt', color: '#444', fontStyle: 'italic' }}>Verified and Received in Good Condition</div>
                                            </div>
                                            <div style={{ padding: '0', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ fontSize: '9pt', fontWeight: 900, padding: '8px', borderBottom: '1px dashed #ccc' }}>For {company.companyName}</div>
                                                <div style={{ flex: 1 }}></div>
                                                <div style={{ padding: '8px', fontSize: '9pt', fontWeight: 900, textTransform: 'uppercase' }}>Authorized Signatory</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {inv.status === 'Cancelled' && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                                        fontSize: '100pt',
                                        fontWeight: 900,
                                        color: 'rgba(239, 68, 68, 0.15)',
                                        border: '15px solid rgba(239, 68, 68, 0.15)',
                                        padding: '20px 50px',
                                        borderRadius: '20px',
                                        pointerEvents: 'none',
                                        zIndex: 100,
                                        textTransform: 'uppercase'
                                    }}>
                                        CANCELLED
                                    </div>
                                )}
                            </div>
                        );
                    });
                })()}
            </div>

            <div className="no-print">

                <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Invoices</button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{inv.displayInvoiceNumber || inv.invoiceNumber}</h1>
                                <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>{inv.paymentStatus}</span>
                                {inv.numberLocked ? (
                                    <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        🔒 LOCKED
                                    </span>
                                ) : (
                                    <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        🔓 UNLOCKED
                                    </span>
                                )}
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                                {inv.customerName} · {fmt(inv.invoiceDate)}
                                {inv.soNumber && <span> · SO: <strong style={{ color: '#374151' }}>{inv.soNumber}</strong></span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                             {isAdmin && (
                                 <>
                                     {!inv.numberLocked && (
                                         <button
                                             onClick={handleRenumber}
                                             style={{ padding: '9px 18px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                         >
                                             🔢 Renumber
                                         </button>
                                     )}
                                     <button
                                         onClick={() => setShowSeriesModal(true)}
                                         style={{ padding: '9px 18px', borderRadius: 8, background: '#8b5cf6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     >
                                         📁 Change Series
                                     </button>
                                     <button
                                         onClick={() => navigate(PATHS.SALES.RESEQUENCE_TOOL, { state: { seriesId: inv.seriesId?._id || inv.seriesId, financialYear: inv.financialYear } })}
                                         style={{ padding: '9px 18px', borderRadius: 8, background: '#4338ca', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     >
                                         🔄 Resequence Series
                                     </button>
                                     {!isEstimate && notCancelled && (
                                         <button
                                             onClick={() => setShowGstModal(true)}
                                             style={{ padding: '9px 18px', borderRadius: 8, background: '#d97706', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                         >
                                             ✏️ Edit GST Return Details
                                         </button>
                                     )}
                                 </>
                             )}
                            {/* Print Button */}
                            <button
                                onClick={() => window.print()}
                                style={{ padding: '9px 18px', borderRadius: 8, background: '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                title="Print Invoice"
                            >
                                🖨️ Print
                            </button>
                            {/* Export PDF Button */}
                            <button
                                onClick={() => {
                                    const origTitle = document.title;
                                    document.title = `Invoice-${inv.invoiceNumber}`;
                                    window.print();
                                    setTimeout(() => { document.title = origTitle; }, 2000);
                                }}
                                style={{ padding: '9px 18px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                title="Export as PDF (Save as PDF in print dialog)"
                            >
                                📄 Export PDF
                             </button>

                            {/* Send WhatsApp Button */}
                            {notCancelled && (
                                <button
                                    onClick={() => setIsCommModalOpen(true)}
                                    style={{ padding: '9px 18px', borderRadius: 8, background: '#25d366', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(37,211,102,0.3)' }}
                                    title="Send Invoice via WhatsApp"
                                >
                                    <span style={{ fontSize: 16 }}>💬</span> Send WhatsApp
                                </button>
                            )}

                             {/* Restore Invoice */}
                             {!notCancelled && (
                                 <button
                                     onClick={handleRestore}
                                     style={{ padding: '9px 18px', borderRadius: 8, background: '#0891b2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     title="Restore this invoice to Active"
                                 >
                                     🔄 Restore Invoice
                                 </button>
                             )}

                             {/* Cancel Invoice */}
                             {notCancelled && canCancelInvoice && (
                                 <button
                                     onClick={() => setCancelDeleteModal('cancel')}
                                     disabled={cancelling}
                                     style={{ padding: '9px 18px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     title="Cancel this invoice (Preserves Number)"
                                 >
                                     {cancelling ? 'Processing...' : '🚫 Cancel Invoice'}
                                 </button>
                             )}

                             {notCancelled && canDeleteInvoice && (
                                 <button
                                     onClick={() => setCancelDeleteModal('delete')}
                                     disabled={cancelling}
                                     style={{ padding: '9px 18px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     title="Delete Invoice (Frees Number, Latest Only)"
                                 >
                                     {cancelling ? 'Processing...' : '🗑️ Delete Invoice'}
                                 </button>
                             )}
                            {/* Receive Payment */}
                            {notCancelled && notFullyPaid && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => navigate('/accounts/receipt-entry', { 
                                            state: { 
                                                source: 'sales_invoice',
                                                invoiceId: inv._id, 
                                                invoiceNumber: inv.invoiceNumber, 
                                                customerId: inv.customerId?._id || inv.customerId, 
                                                customerName: inv.customerName,
                                                ledgerId: inv.customerLedgerId,
                                                ledgerName: inv.customerLedgerName,
                                                amount: (inv.roundedTotal || inv.grandTotal) - inv.paidAmount 
                                            } 
                                        })}
                                        style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}
                                    >
                                        💳 Receive Payment
                                    </button>
                                    <button
                                        onClick={() => navigate('/accounts/receipt-entry', { 
                                            state: { 
                                                source: 'sales_invoice',
                                                invoiceId: inv._id, 
                                                invoiceNumber: inv.invoiceNumber, 
                                                customerId: inv.customerId?._id || inv.customerId, 
                                                customerName: inv.customerName,
                                                ledgerId: inv.customerLedgerId,
                                                ledgerName: inv.customerLedgerName,
                                                amount: (inv.roundedTotal || inv.grandTotal) - inv.paidAmount,
                                                paymentMode: 'Adjustment' // Set mode to Adjustment
                                            } 
                                        })}
                                        style={{ padding: '9px 18px', borderRadius: 8, background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(22,101,52,0.1)' }}
                                    >
                                        ⚖️ Adjust from Credit
                                    </button>
                                </div>
                            )}

                            {/* E-Way Bill & E-Invoice */}
                            {notCancelled && isFeatureEnabled('gst.eWayBillRequired') && (
                                    <button
                                        onClick={handleEwayBill}
                                        style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}
                                    >
                                        🚚 Prepare E-Way Bill
                                    </button>
                            )}
                            {notCancelled && isFeatureEnabled('gst.eInvoiceRequired') && (
                                    <button
                                        onClick={handleEInvoice}
                                        style={{ padding: '9px 18px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
                                    >
                                        📄 Prepare E-Invoice
                                    </button>
                            )}


                        </div>
                    </div>
                    {/* Payment Progress */}
                    {inv.roundedTotal > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                                <span>Paid: {fmtCur(inv.paidAmount)}</span>
                                <span>Remaining: {fmtCur((inv.roundedTotal || inv.grandTotal) - inv.paidAmount)}</span>
                                <span>Total: {fmtCur(inv.roundedTotal || inv.grandTotal)}</span>
                            </div>
                            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (inv.paidAmount / (inv.roundedTotal || inv.grandTotal)) * 100)}%`, background: 'linear-gradient(90deg,#0d9488,#2563eb)', borderRadius: 99, transition: 'width 0.4s' }} />
                            </div>
                        </div>
                    )}
                    {isFeatureEnabled('sales.enableBarcodeQr') && (
                    <div style={{ marginTop: 16, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>QR & Barcode</div>
                        <InvoiceBarcodeBlock invoiceId={id} variant="screen" />
                    </div>
                    )}
                    {billWiseRows.length > 0 && (
                        <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: 800, fontSize: 12, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>Bill-wise adjustments</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...th, fontSize: 10 }}>Receipt No.</th>
                                        <th style={{ ...th, fontSize: 10 }}>Date</th>
                                        <th style={{ ...th, fontSize: 10 }}>Amount</th>
                                        <th style={{ ...th, fontSize: 10 }}>Reversed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {billWiseRows.map((r) => (
                                        <tr key={r._id}>
                                            <td style={td}>{r.paymentNo}</td>
                                            <td style={td}>{fmt(r.adjustmentDate)}</td>
                                            <td style={td}>{fmtCur(r.adjustedAmount)}</td>
                                            <td style={td}>{r.isReversed ? 'Yes' : 'No'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ padding: '20px 28px', maxWidth: 1000, margin: '0 auto' }}>
                    {/* Simplified Dashboard View - Just the Invoice Document */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: '40px', maxWidth: '900px', margin: '0 auto', color: '#000' }}>
                        
                        {/* Header: Logo & Company */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px', borderBottom: '2px solid #eee', paddingBottom: '15px' }}>
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                                {!isEstimate && <img src="/logo.jpeg" style={{ maxWidth: '120px', maxHeight: '60px', objectFit: 'contain' }} />}
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, textTransform: 'uppercase' }}>{company.companyName}</h2>
                                    {!isEstimate && (
                                        <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>
                                            {company.address}, {company.city}<br/>
                                            {gstApplicable && <strong>GSTIN: {company.gstNumber}</strong>}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#64748b' }}>{isEstimate ? 'ESTIMATE' : (gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE')}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5 }}>{isEstimate ? 'ESTIMATE NO' : 'INVOICE NO'}: {inv.invoiceNumber}</div>
                            </div>
                        </div>


                        {/* Parties Block */}
                        <div style={{ display: 'grid', gridTemplateColumns: isEstimate ? '1fr' : '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>{isEstimate ? 'Estimate For' : 'Billed To'}</div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>{inv.customerName}</div>
                                {!isEstimate && <div style={{ fontSize: 13, color: '#334155', marginTop: 5, whiteSpace: 'pre-wrap' }}>{inv.billingAddress}</div>}
                                {!isEstimate && inv.customerGstin && <div style={{ fontSize: 12, marginTop: 5 }}><strong>GSTIN:</strong> {inv.customerGstin}</div>}
                            </div>
                            {!isEstimate && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Shipped To</div>
                                    <div style={{ fontSize: 15, fontWeight: 800 }}>{inv.customerName}</div>
                                    <div style={{ fontSize: 13, color: '#334155', marginTop: 5, whiteSpace: 'pre-wrap' }}>{inv.shippingAddress || inv.billingAddress}</div>
                                    {(inv.shippingGstin || inv.customerGstin) && <div style={{ fontSize: 12, marginTop: 5 }}><strong>GSTIN:</strong> {inv.shippingGstin || inv.customerGstin}</div>}
                                </div>
                            )}
                        </div>

                        {/* Invoice Details & Meta */}
                        {!isEstimate && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px', background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                <table style={{ width: '100%', fontSize: 13 }}>
                                    <tbody>
                                        <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Invoice Date:</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{new Date(inv.invoiceDate).toLocaleDateString('en-GB')}</td></tr>
                                        <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Due Date:</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{inv.paymentDueDate ? new Date(inv.paymentDueDate).toLocaleDateString('en-GB') : '—'}</td></tr>
                                        <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Place of Supply:</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{inv.placeOfSupply || inv.billingState}</td></tr>
                                    </tbody>
                                </table>
                                <table style={{ width: '100%', fontSize: 13 }}>
                                    <tbody>
                                        <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Sales Order No:</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{inv.soNumber || '—'}</td></tr>
                                        <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Buyer Order No:</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{inv.buyerOrderNo || '—'}</td></tr>
                                        <tr><td style={{ color: '#64748b', padding: '3px 0' }}>Dispatch Thru:</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{inv.dispatchThrough || '—'}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        )}


                        {/* Items Table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #000' }}>
                                     <th style={{ textAlign: 'left', padding: '12px 0', fontSize: 12, textTransform: 'uppercase', color: '#64748b' }}>Item & Description</th>
                                    {!isEstimate && <th style={{ textAlign: 'left', padding: '12px 10px', fontSize: 12, textTransform: 'uppercase', color: '#64748b', width: '150px' }}>Additional Notes</th>}
                                    <th style={{ textAlign: 'center', padding: '12px 10px', fontSize: 12, textTransform: 'uppercase', color: '#64748b', width: '80px' }}>Qty</th>
                                    <th style={{ textAlign: 'right', padding: '12px 10px', fontSize: 12, textTransform: 'uppercase', color: '#64748b', width: '120px' }}>Rate</th>
                                    <th style={{ textAlign: 'right', padding: '12px 0', fontSize: 12, textTransform: 'uppercase', color: '#64748b', width: '140px' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inv.items?.map((it, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '15px 0' }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{it.description || it.itemName}</div>
                                            {it.additionalNotes && isEstimate && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Note: {it.additionalNotes}</div>}
                                            {it.modelNo && !isEstimate && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{it.modelNo}</div>}
                                            {it.hsnCode && !isEstimate && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>HSN/SAC: {it.hsnCode}</div>}
                                        </td>
                                        {!isEstimate && <td style={{ padding: '15px 10px', fontSize: 12, color: '#4b5563' }}>{it.additionalNotes || '—'}</td>}
                                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{it.qty} {it.uom || 'NOS'}</td>
                                        <td style={{ textAlign: 'right' }}>{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(it.taxableAmount || (it.qty * it.rate) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Summary Block */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ width: '350px' }}>
                                {!isEstimate && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                                            <span style={{ color: '#64748b' }}>Total Item Value</span>
                                            <span>₹ {(inv.totalTaxableAmount - (inv.freightAmount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {Number(inv.freightAmount || 0) > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                                                <span style={{ color: '#64748b' }}>+ Freight / Shipping</span>
                                                <span>₹ {Number(inv.freightAmount).toFixed(2)}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, fontWeight: 700 }}>
                                    <span style={{ color: '#64748b' }}>{isEstimate ? 'Total Estimated Price' : 'Total Taxable Value'}</span>
                                    <span>₹ {(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {!isEstimate && gstApplicable && (
                                    <>
                                        {isIGST ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                                                <span style={{ color: '#64748b' }}>+ IGST @ {inv.items?.[0]?.taxRate || 18}%</span>
                                                <span>₹ {(inv.totalIgst || inv.totalTaxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                                                    <span style={{ color: '#64748b' }}>+ CGST @ {(inv.items?.[0]?.taxRate || 18) / 2}%</span>
                                                    <span>₹ {(inv.totalCgst || (inv.totalTaxAmount/2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                                                    <span style={{ color: '#64748b' }}>+ SGST @ {(inv.items?.[0]?.taxRate || 18) / 2}%</span>
                                                    <span>₹ {(inv.totalSgst || (inv.totalTaxAmount/2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {inv.roundOff !== 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                                        <span style={{ color: '#64748b' }}>Round Off</span>
                                        <span>{Number(inv.roundOff).toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 15, paddingTop: 15, borderTop: '2px solid #000', fontSize: 18, fontWeight: 900 }}>
                                    <span>{isEstimate ? 'Total Estimated Price' : 'Total'}</span>
                                    <span>₹ {(inv.roundedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {!isEstimate && <div style={{ fontSize: 11, fontStyle: 'italic', textAlign: 'right', marginTop: 10, color: '#64748b' }}> In Words: {inv.amountInWords} </div>}
                            </div>
                        </div>

                        {/* Footer Info */}
                        {!isEstimate && (
                            <div style={{ marginTop: '50px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                                <div style={{ fontSize: 12, color: '#475569' }}>
                                    <div style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>Bank Details</div>
                                    <div>{company.bankName}</div>
                                    <div>A/c: {company.accountNo}</div>
                                    <div>IFSC: {company.ifscCode}</div>
                                </div>
                                <div style={{ fontSize: 12, textAlign: 'right', color: '#475569' }}>
                                    <div style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>For {company.companyName}</div>
                                    <div style={{ fontWeight: 700, marginTop: 4 }}>{inv.createdBy?.name || 'Authorized User'}</div>
                                    {inv.createdBy?.mobile && <div>Mob: {inv.createdBy.mobile}</div>}
                                    <div style={{ marginTop: 24, fontWeight: 700 }}>Authorized Signatory</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>



            {/* Series Change Modal */}
            {showSeriesModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 450, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Move Invoice to Different Series</h3>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                            Moving this invoice will change its Prefix and Serial Number. 
                            The system will automatically assign the next available number in the target series.
                        </p>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {seriesList.filter(s => s._id !== inv.seriesId?._id).map(s => (
                                <button 
                                    key={s._id} 
                                    onClick={() => handleChangeSeries(s._id)}
                                    style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', textAlign: 'left', cursor: 'pointer', transition: 'background 0.2s' }}
                                    onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseOut={(e) => e.currentTarget.style.background = '#f8fafc'}
                                >
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.seriesName}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Prefix: {s.prefix} · FY: {s.financialYear}</div>
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => setShowSeriesModal(false)}
                            style={{ width: '100%', marginTop: 20, padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: 8, color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Communication Modal (WhatsApp/Email) */}
            {isCommModalOpen && (
                <CommunicationModal
                    isOpen={isCommModalOpen}
                    onClose={() => setIsCommModalOpen(false)}
                    customer={{
                        name: inv.customerName,
                        phone: inv.customerPhone || inv.customerId?.phone,
                        email: inv.customerEmail || inv.customerId?.email
                    }}
                    document={{
                        number: inv.displayInvoiceNumber || inv.invoiceNumber,
                        date: new Date(inv.invoiceDate).toLocaleDateString('en-GB'),
                        amount: (inv.roundedTotal || inv.grandTotal),
                        type: 'Sales Invoice',
                        publicUrl: `${window.location.origin}/documents/invoice/${inv._id}`
                    }}
                    onSend={handleSendComm}
                />
            )}

            {/* Admin GST Correction Modal */}
            {showGstModal && (
                <GstCorrectionModal 
                    inv={inv} 
                    onClose={() => setShowGstModal(false)} 
                    onSuccess={() => { setShowGstModal(false); load(); }} 
                />
            )}

            <SalesInvoiceCancelDeleteModal
                open={!!cancelDeleteModal}
                mode={cancelDeleteModal || 'cancel'}
                invoiceNumber={inv.displayInvoiceNumber || inv.invoiceNumber}
                salesInvoiceId={id}
                onClose={() => setCancelDeleteModal(null)}
                onConfirm={handleCancelDeleteConfirm}
                submitting={cancelling}
            />

            {/* Print Styles */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; padding: 0 !important; }
                    @page { size: A4; margin: 0; }
                    body { background: #fff !important; }
                }
            `}</style>
        </div>
    );
}
