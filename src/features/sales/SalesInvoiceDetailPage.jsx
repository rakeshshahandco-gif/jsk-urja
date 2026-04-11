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
import toast from 'react-hot-toast';

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
    const { hasRole } = useAuth();
    const isAdmin = hasRole('admin') || hasRole('superadmin');
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('invoice');
    const [cancelling, setCancelling] = useState(false);
    const [seriesList, setSeriesList] = useState([]);
    const [showSeriesModal, setShowSeriesModal] = useState(false);

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

    useEffect(() => { 
        load(); 
        getInvoiceSeries({ active: true }).then(setSeriesList).catch(() => {});
    }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const handleCancel = async () => {
        if (!isAdmin) return toast.error('Only administrators can cancel invoices');
        
        const reason = window.prompt('CANCEL INVOICE (Rule 1 & 2):\n\nThis will reverse stock and ledger impacts but the INVOICE NUMBER WILL REMAIN RESERVED and cannot be reused.\n\nPlease enter the reason for cancellation:');
        if (!reason || !reason.trim()) return;

        setCancelling(true);
        try { 
            const res = await cancelSalesInvoice(id, { reason }); 
            toast.success(res.message || 'Invoice cancelled. Number reserved.'); 
            load(); 
        }
        catch (e) { toast.error(e.response?.data?.message || 'Failed to cancel'); }
        finally { setCancelling(false); }
    };

    const handleDelete = async () => {
        if (!isAdmin) return toast.error('Only administrators can delete invoices');

        const msg = `STRICT DELETE RULE (Rule 3):\n\n1. You can ONLY delete the LATEST invoice in a series.\n2. Deletion will PERMANENTLY remove the record and FREE UP the number for reuse.\n\nPlease enter the reason for deletion:`;
        const reason = window.prompt(msg);
        if (!reason || !reason.trim()) return;
        
        setCancelling(true);
        try {
            const res = await deleteSalesInvoice(id, { reason });
            toast.success(res.message || 'Invoice deleted and number freed.');
            navigate(PATHS.SALES.INVOICES);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to delete. Sequence violation detected.');
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



    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!inv) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>Invoice not found.</div>;

    const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS.Unpaid;
    const isIGST = inv.gstType === 'IGST';
    const gstApplicable = inv.gstApplicable !== false;
    const isEstimate = inv.seriesId?.isEstimate;
    const notCancelled = inv.status !== 'Cancelled';
    const notFullyPaid = inv.paymentStatus !== 'Paid';

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* PRINT ONLY LAYOUT (PROFESSIONAL TAX INVOICE) */}
            <div className="print-only" style={{ display: 'none', width: '210mm', padding: 0, color: '#000', fontSize: '9pt' }}>
                <div className="print-content" style={{ padding: '8mm', minHeight: '280mm', display: 'flex', flexDirection: 'column', background: '#fff', boxSizing: 'border-box' }}>
                    
                    {/* Header: Logo & Company Full Details */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                            {!isEstimate && (
                                <>
                                    <img src="/logo.jpeg" alt="Logo" style={{ maxHeight: `${company.logoHeight || 60}px`, maxWidth: '150px', objectFit: 'contain' }} />
                                    <div>
                                        <div style={{ fontSize: '18pt', fontWeight: 900, textTransform: 'uppercase', marginBottom: '2px' }}>{company.companyName}</div>
                                        <div style={{ fontSize: '8.5pt', lineHeight: '1.2', maxWidth: '400px' }}>
                                            {company.address}, {company.city} - {company.pincode}, {company.state} (Code: {company.stateCode})<br />
                                            {company.phone && `Contact: ${company.phone}`} {company.email && ` | Email: ${company.email}`}<br />
                                            {gstApplicable && company.gstNumber && <span><strong>GSTIN: {company.gstNumber}</strong> | </span>}
                                            {company.panNumber && <span>PAN: {company.panNumber}</span>}<br />
                                            {company.cin && <span>CIN: {company.cin} | </span>}
                                            {company.urn && <span>MSME/URN: {company.urn}</span>}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16pt', fontWeight: 900, color: '#000', border: '2px solid #000', padding: '2px 10px', display: 'inline-block', marginBottom: '5px' }}>
                                {inv.seriesId?.isEstimate ? 'ESTIMATE' : (gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE')}
                            </div>
                            <div style={{ fontSize: '10pt', fontWeight: 700 }}>Invoice No: {inv.invoiceNumber}</div>
                            <div style={{ fontSize: '10pt', fontWeight: 600 }}>Date: {new Date(inv.invoiceDate).toLocaleDateString('en-GB')}</div>
                        </div>
                    </div>

                    {/* Meta Details Block */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', borderBottom: 'none' }}>
                        <div style={{ borderRight: '1px solid #000', padding: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                                <tbody>
                                    <tr><td style={{ color: '#555', width: '120px' }}>Sales Order No:</td><td style={{ fontWeight: 700 }}>{inv.soNumber || '—'}</td></tr>
                                    <tr><td style={{ color: '#555' }}>Buyer Order No:</td><td style={{ fontWeight: 700 }}>{inv.buyerOrderNo || '—'}</td></tr>
                                    <tr><td style={{ color: '#555' }}>Buyer Order Date:</td><td>{inv.buyerOrderDate ? new Date(inv.buyerOrderDate).toLocaleDateString('en-GB') : '—'}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                                <tbody>
                                    <tr><td style={{ color: '#555', width: '120px' }}>Dispatch Through:</td><td style={{ fontWeight: 700 }}>{inv.dispatchThrough || '—'}</td></tr>
                                    <tr><td style={{ color: '#555' }}>Place of Supply:</td><td style={{ fontWeight: 700 }}>{inv.placeOfSupply || inv.billingState || '—'}</td></tr>
                                    <tr><td style={{ color: '#555' }}>Payment Due Date:</td><td>{inv.paymentDueDate ? new Date(inv.paymentDueDate).toLocaleDateString('en-GB') : '—'}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Buyer & Ship To Side-by-Side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', borderBottom: 'none' }}>
                        <div style={{ borderRight: '1px solid #000', padding: '8px' }}>
                            {!isEstimate && <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Bill To (Buyer):</div>}
                            <div style={{ fontSize: '10pt', fontWeight: 900 }}>{inv.customerName}</div>
                            <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap', marginBottom: '4px' }}>{inv.billingAddress}</div>
                            {!isEstimate && (
                                <div style={{ fontSize: '8.5pt' }}>
                                    {inv.customerGstin && <div><strong>GSTIN:</strong> {inv.customerGstin}</div>}
                                    {inv.customerPhone && <div><strong>Mobile:</strong> {inv.customerPhone}</div>}
                                    {inv.customerEmail && <div><strong>Email:</strong> {inv.customerEmail}</div>}
                                    <div><strong>State:</strong> {inv.billingState} ({inv.billingStateCode})</div>
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '8px' }}>
                            {!isEstimate && <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Ship To (Consignee):</div>}
                            <div style={{ fontSize: '10pt', fontWeight: 900 }}>{inv.customerName}</div>
                            <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap', marginBottom: '4px' }}>{inv.shippingAddress || inv.billingAddress}</div>
                            {!isEstimate && (
                                <div style={{ fontSize: '8.5pt' }}>
                                    {inv.shippingGstin || inv.customerGstin ? <div><strong>GSTIN:</strong> {inv.shippingGstin || inv.customerGstin}</div> : null}
                                    {inv.shippingPhone || inv.customerPhone ? <div><strong>Mobile:</strong> {inv.shippingPhone || inv.customerPhone}</div> : null}
                                    <div><strong>State:</strong> {inv.shippingState || inv.billingState} ({inv.shippingStateCode || inv.billingStateCode})</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Item Table */}
                    <div style={{ flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                            <thead>
                                <tr style={{ background: '#f5f5f5' }}>
                                    <th style={{ width: '35px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>SR</th>
                                    <th style={{ width: '90px', border: '1px solid #000', padding: '6px 4px', fontSize: '8pt' }}>ITEM CODE</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '8pt', textAlign: 'left' }}>DESCRIPTION</th>
                                    <th style={{ width: '120px', border: '1px solid #000', padding: '6px 4px', fontSize: '8pt' }}>ADDITIONAL NOTES</th>
                                    <th style={{ width: '70px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>HSN/SAC</th>
                                    <th style={{ width: '45px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>UOM</th>
                                    <th style={{ width: '50px', border: '1px solid #000', padding: '6px 2px', fontSize: '8pt' }}>QTY</th>
                                    <th style={{ width: '90px', border: '1px solid #000', padding: '6px 4px', fontSize: '8pt', textAlign: 'right' }}>RATE</th>
                                    <th style={{ width: '100px', border: '1px solid #000', padding: '6px 4px', fontSize: '8pt', textAlign: 'right' }}>AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(inv.items || []).map((it, i) => (
                                    <tr key={i} style={{ minHeight: '25px' }}>
                                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{i + 1}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px', fontSize: '8.5pt' }}>{it.itemCode || '—'}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '9.5pt', fontWeight: 700, textTransform: 'uppercase' }}>{it.description || it.itemName}</td>
                                         <td style={{ border: '1px solid #000', padding: '4px', fontSize: '8pt', color: '#444' }}>{it.additionalNotes || '—'}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{it.hsnCode || '—'}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{it.uom || 'NOS'}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>{it.qty}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>{Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{Number(it.taxableAmount || (it.qty * it.rate) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}

                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '15px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', border: '1px solid #000' }}>
                            {/* Left: Bank & Notes */}
                            <div style={{ borderRight: '1px solid #000', padding: '8px' }}>
                                {!isEstimate && (
                                    <div style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', borderBottom: '1px solid #eee', paddingBottom: '2px', marginBottom: '4px' }}>Bank Details:</div>
                                        <div style={{ fontSize: '8.5pt', lineHeight: '1.3' }}>
                                            <strong>{company.bankName || 'BANK OF BARODA'}</strong><br />
                                            Account Name: {company.companyName}<br />
                                            Account No: {company.accountNo || '—'}<br />
                                            IFSC Code: {company.ifscCode || '—'} | Branch: {company.branchName || '—'}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', color: '#555', borderBottom: '1px solid #eee', paddingBottom: '2px', marginBottom: '4px' }}>Terms & Declaration:</div>
                                    <div style={{ fontSize: '7.5pt', color: '#333', lineHeight: '1.2' }}>
                                        {!isEstimate && <>1. Goods once sold will not be taken back.<br /></>}
                                        2. Subject to MUMBAI Jurisdiction.<br />
                                        3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                                    </div>
                                </div>
                            </div>
                            
                            {/* Right: Totals & GST Summary */}
                            <div style={{ padding: '0' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>Total Item Value</td>
                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700 }}>₹ {(inv.totalTaxableAmount - (inv.freightAmount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        {Number(inv.freightAmount || 0) > 0 && (
                                            <tr>
                                                <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>+ Freight / Shipping</td>
                                                <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹ {Number(inv.freightAmount).toFixed(2)}</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{isEstimate ? 'Total Estimate' : 'Total Taxable Value'}</td>
                                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700 }}>₹ {(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        {gstApplicable && (
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

                        {/* Amount in Words */}
                        <div style={{ border: '1px solid #000', borderTop: 'none', padding: '6px 8px', fontSize: '9pt', background: '#fafafa' }}>
                            <span style={{ fontWeight: 800, textTransform: 'uppercase', marginRight: '5px' }}>Amount in Words:</span>
                            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{inv.amountInWords}</span>
                        </div>

                        {/* Signatures */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', borderTop: 'none', height: '100px' }}>
                            <div style={{ borderRight: '1px solid #000', padding: '8px', fontSize: '8pt', position: 'relative' }}>
                                <div style={{ fontWeight: 900, marginBottom: '4px' }}>Receiver&apos;s Signature:</div>
                                <div style={{ position: 'absolute', bottom: '8px', left: '8px', fontSize: '7pt', color: '#666' }}>Checked and Received in Good Condition</div>
                            </div>
                            <div style={{ padding: '8px', textAlign: 'center', position: 'relative' }}>
                                <div style={{ fontSize: '9pt', fontWeight: 800 }}>For {company.companyName}</div>
                                <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, fontSize: '9pt', fontWeight: 900 }}>Authorized Signatory</div>
                            </div>
                        </div>

                        {/* Watermark for Cancelled */}
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

                        <div style={{ textAlign: 'center', fontSize: '7.5pt', color: '#666', marginTop: '10px' }}>
                            This is a computer generated tax invoice and does not require a physical signature.
                        </div>
                    </div>
                </div>
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
                             {notCancelled && isAdmin && (
                                 <button
                                     onClick={handleCancel}
                                     disabled={cancelling}
                                     style={{ padding: '9px 18px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     title="Cancel this invoice (Preserves Number)"
                                 >
                                     {cancelling ? 'Processing...' : '🚫 Cancel Invoice'}
                                 </button>
                             )}

                             {/* Delete Invoice */}
                             {notCancelled && isAdmin && (
                                 <button
                                     onClick={handleDelete}
                                     disabled={cancelling}
                                     style={{ padding: '9px 18px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                                     title="Delete Invoice (Frees Number, Latest Only)"
                                 >
                                     {cancelling ? 'Processing...' : '🗑️ Delete Invoice'}
                                 </button>
                             )}
                            {/* Receive Payment */}
                            {notCancelled && notFullyPaid && (
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
                </div>

                <div style={{ padding: '20px 28px', maxWidth: 1000, margin: '0 auto' }}>
                    {/* Simplified Dashboard View - Just the Invoice Document */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: '40px', maxWidth: '900px', margin: '0 auto', color: '#000' }}>
                        
                        {/* Header: Logo & Company */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px', borderBottom: '2px solid #eee', paddingBottom: '15px' }}>
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                                <img src="/logo.jpeg" style={{ maxWidth: '120px', maxHeight: '60px', objectFit: 'contain' }} />
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, textTransform: 'uppercase' }}>{company.companyName}</h2>
                                    <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>
                                        {company.address}, {company.city}<br/>
                                        {gstApplicable && <strong>GSTIN: {company.gstNumber}</strong>}
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#64748b' }}>{gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE'}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5 }}>{inv.invoiceNumber}</div>
                            </div>
                        </div>

                        {/* Parties Block */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Billed To</div>
                                <div style={{ fontSize: 15, fontWeight: 800 }}>{inv.customerName}</div>
                                <div style={{ fontSize: 13, color: '#334155', marginTop: 5, whiteSpace: 'pre-wrap' }}>{inv.billingAddress}</div>
                                {inv.customerGstin && <div style={{ fontSize: 12, marginTop: 5 }}><strong>GSTIN:</strong> {inv.customerGstin}</div>}
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Shipped To</div>
                                <div style={{ fontSize: 15, fontWeight: 800 }}>{inv.customerName}</div>
                                <div style={{ fontSize: 13, color: '#334155', marginTop: 5, whiteSpace: 'pre-wrap' }}>{inv.shippingAddress || inv.billingAddress}</div>
                                {(inv.shippingGstin || inv.customerGstin) && <div style={{ fontSize: 12, marginTop: 5 }}><strong>GSTIN:</strong> {inv.shippingGstin || inv.customerGstin}</div>}
                            </div>
                        </div>

                        {/* Invoice Details & Meta */}
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

                        {/* Items Table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #000' }}>
                                     <th style={{ textAlign: 'left', padding: '12px 0', fontSize: 12, textTransform: 'uppercase', color: '#64748b' }}>Item & Description</th>
                                    <th style={{ textAlign: 'left', padding: '12px 10px', fontSize: 12, textTransform: 'uppercase', color: '#64748b', width: '150px' }}>Additional Notes</th>
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
                                            {it.modelNo && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{it.modelNo}</div>}
                                            {it.hsnCode && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>HSN/SAC: {it.hsnCode}</div>}
                                        </td>
                                         <td style={{ padding: '15px 10px', fontSize: 12, color: '#4b5563' }}>{it.additionalNotes || '—'}</td>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, fontWeight: 700 }}>
                                    <span style={{ color: '#64748b' }}>{isEstimate ? 'Total Estimate' : 'Total Taxable Value'}</span>
                                    <span>₹ {(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {gstApplicable && (
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
                                    <span>Total</span>
                                    <span>₹ {(inv.roundedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ fontSize: 11, fontStyle: 'italic', textAlign: 'right', marginTop: 10, color: '#64748b' }}> In Words: {inv.amountInWords} </div>
                            </div>
                        </div>

                        {/* Footer Info */}
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
