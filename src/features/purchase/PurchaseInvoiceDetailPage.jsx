import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPurchaseInvoiceById, cancelPurchaseInvoice, confirmPurchaseInvoice, deletePurchaseInvoice, getPaymentsByInvoice } from '@/services/purchaseApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { numberToWords } from '@/utils/numberToWords';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    Confirmed: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Cancelled: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    Draft: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
};
const PAY_COLORS = {
    Unpaid: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Partially Paid': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Paid: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#6b7280', bg: '#f9fafb', border: '#e2e8f0' },
};
const MODE_ICONS = { Cash: '💵', UPI: '📱', Cheque: '🏦', 'Net Banking': '🌐', 'NEFT/RTGS/IMPS': '⚡', Card: '💳', Other: '🔖' };

export default function PurchaseInvoiceDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [payments, setPayments] = useState([]);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [activeTab, setActiveTab] = useState('invoice'); // invoice | payments

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getPurchaseInvoiceById(id),
            getPaymentsByInvoice(id),
            getCompanyProfile().catch(() => ({ data: {} }))
        ]).then(([invData, payData, companyRes]) => {
            setInv(invData);
            setPayments(Array.isArray(payData) ? payData : []);
            setCompany(companyRes?.data || {});
        }).catch((err) => {
            console.error('[PurchaseInvoiceDetail] Error loading detail:', err);
            toast.error('Failed to load invoice');
        })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const handleCancel = async () => {
        if (!window.confirm('Cancel this invoice? The record remains and the number is reserved. Side effects (stock/PO/GRN/Ledger) will be reversed.')) return;
        setCancelling(true);
        try { 
            const res = await cancelPurchaseInvoice(id); 
            toast.success(res.message || 'Invoice cancelled'); 
            load(); 
        }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to cancel'); }
        finally { setCancelling(false); }
    };

    const handleDelete = async () => {
        const reason = window.prompt('DELETION IS ONLY ALLOWED FOR THE LATEST INVOICE.\n\nThis will permanently delete the record and FREE UP the invoice number for reuse.\n\nEnter reason for deletion:');
        if (!reason) return;
        
        setCancelling(true);
        try {
            const res = await deletePurchaseInvoice(id, { reason });
            toast.success(res.message || 'Invoice deleted and number freed.');
            navigate(PATHS.PURCHASE.INVOICES);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to delete. Checks for latest invoice may have failed.');
        } finally {
            setCancelling(false);
        }
    };

    const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} `;

    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>Loading...</div>;
    if (!inv) return <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>Invoice not found.</div>;

    // ── Compute live payment totals from payments array (overrides stale DB field) ──
    const livePaidAmount = Math.round(
        payments
            .filter(p => p.paymentStatus !== 'Failed')
            .reduce((sum, p) => sum + (p.amountPaid || 0), 0) * 100
    ) / 100;
    const livePaymentStatus = inv.status === 'Cancelled' ? 'Cancelled'
        : livePaidAmount <= 0 ? 'Unpaid'
            : livePaidAmount >= (inv.grandTotal || 0) ? 'Paid'
                : 'Partially Paid';

    const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.Draft;
    const pc = PAY_COLORS[livePaymentStatus] || PAY_COLORS.Unpaid;
    const isIGST = inv.gstType === 'IGST';
    const gstApplicable = Boolean(
        (inv.totalIgst || 0) > 0 ||
        (inv.totalCgst || 0) > 0 ||
        (inv.totalSgst || 0) > 0 ||
        (inv.items || []).some(it => (it.gstRate ?? it.taxPercent ?? 0) > 0)
    );
    const notCancelled = inv.status !== 'Cancelled';
    const notFullyPaid = livePaymentStatus !== 'Paid';

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* PRINT-ONLY COMPLETE LAYOUT (A4 Container) */}
            <div className="print-only" style={{ display: 'none', width: '210mm', padding: 0, margin: '0 auto' }}>
                <div className="print-content" style={{ border: '1px solid #000', padding: '20px', height: '270mm', display: 'flex', flexDirection: 'column', background: '#fff', boxSizing: 'border-box' }}>
                    {/* Header Section */}
                    <div className="p-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '20px', marginBottom: '25px' }}>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                            {company.logoUrl && (
                                <img src={company.logoUrl} alt="Logo" style={{ maxHeight: '80px', maxWidth: '120px', objectFit: 'contain' }} />
                            )}
                            <div>
                                <div style={{ fontSize: '22pt', fontWeight: 900, color: '#000', marginBottom: '2px', lineHeight: 1.1 }}>{company.companyName || 'JSK URJA'}</div>
                                <div style={{ fontSize: '9pt', color: '#000', lineHeight: '1.4', maxWidth: '400px' }}>
                                    {company.address}<br />
                                    {(company.city || company.state) ? `${company.city} ${company.state}, India. Postal Code: ${company.pincode}` : ''}<br />
                                    Phone: {company.phone} | Email: {company.email}<br />
                                    {company.gstNumber && <strong>GSTIN: {company.gstNumber}</strong>}
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h1 style={{ margin: '0 0 4px 0', fontSize: '16pt', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>PURCHASE INVOICE</h1>
                            <div style={{ fontSize: '14pt', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>{inv.invoiceNumber}</div>
                            <table style={{ borderCollapse: 'collapse', float: 'right', textAlign: 'left', fontSize: '11px' }}>
                                <tbody>
                                    <tr><td style={{ padding: '2px 10px 2px 0', borderRight: '1px solid #000', fontWeight: 800 }}>DATE</td><td style={{ padding: '2px 0 2px 10px' }}>{fmt(inv.invoiceDate)}</td></tr>
                                    <tr><td style={{ padding: '2px 10px 2px 0', borderRight: '1px solid #000', fontWeight: 800 }}>PO REF</td><td style={{ padding: '2px 0 2px 10px' }}>{inv.poNumber || '—'}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Parties */}
                    <div className="p-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #000', marginBottom: '20px' }}>
                        <div style={{ padding: '10px', borderRight: '1px solid #000' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', borderBottom: '1px solid #000', paddingBottom: '4px' }}>Billed By (Supplier)</div>
                            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{inv.supplierName}</div>
                            {inv.supplierAddress && <div style={{ fontSize: '12px', marginBottom: '2px' }}>{inv.supplierAddress}</div>}
                            {inv.supplierGstin && <div style={{ fontSize: '12px' }}><strong>GSTIN:</strong> {inv.supplierGstin}</div>}
                            {(inv.supplierState || inv.supplierStateCode) && <div style={{ fontSize: '12px' }}><strong>State:</strong> {inv.supplierState} {inv.supplierStateCode ? `(${inv.supplierStateCode})` : ''}</div>}
                            {(inv.supplierPhone || inv.supplierId?.phone) && <div style={{ fontSize: '12px' }}><strong>Phone:</strong> {inv.supplierPhone || inv.supplierId?.phone}</div>}
                        </div>
                        <div style={{ padding: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', borderBottom: '1px solid #000', paddingBottom: '4px' }}>Billed To (Buyer)</div>
                            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{inv.buyerName || company.companyName || 'JSK URJA'}</div>
                            {inv.buyerAddress ? (
                                <div style={{ fontSize: '12px', marginBottom: '2px' }}>{inv.buyerAddress}</div>
                            ) : (
                                <>
                                    {company.address && <div style={{ fontSize: '12px', color: '#000', maxWidth: '350px' }}>{company.address}</div>}
                                    {(company.city || company.state) && <div style={{ fontSize: '12px', color: '#000' }}>{company.city} {company.state} {company.pincode}</div>}
                                </>
                            )}
                            {inv.buyerGstin && <div style={{ fontSize: '12px' }}><strong>GSTIN:</strong> {inv.buyerGstin}</div>}
                            {(inv.buyerState || inv.buyerStateCode) && <div style={{ fontSize: '12px' }}><strong>State:</strong> {inv.buyerState} {inv.buyerStateCode ? `(${inv.buyerStateCode})` : ''}</div>}
                        </div>
                    </div>

                    {/* Metadata Table */}
                    <div style={{ marginBottom: '20px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '12px' }}>
                            <thead>
                                <tr>
                                    {['Mode of Transport', 'Vehicle No', 'GR/LR No', 'Place of Supply'].map((h, i) => (
                                        <th key={i} style={{ border: '1px solid #000', padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #000', padding: '6px 10px' }}>{inv.transporterName || '—'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px 10px' }}>{inv.vehicleNo || '—'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px 10px' }}>{inv.lrNumber || '—'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px 10px' }}>{inv.placeOfSupply || '—'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Items Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '12px', marginBottom: 'auto' }}>
                        <thead>
                            <tr style={{ background: '#f8f9fa' }}>
                                {['Sr.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Taxable Amt.', isIGST ? 'IGST Amt' : 'CGST+SGST Amt', 'Amount', ''].map((h, i) => (
                                    <th key={i} style={{ border: '1px solid #000', padding: '8px 10px', textAlign: h === 'Description of Goods' ? 'left' : 'right', fontWeight: 700 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(inv.items || []).map((it, i) => (
                                <tr key={i}>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{i + 1}</td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', verticalAlign: 'top' }}>
                                        <strong>{it.itemName}</strong>
                                        {it.itemCode && <div>Code: {it.itemCode}</div>}
                                        {it.description && <div style={{ fontSize: '11px', color: '#444' }}>{it.description}</div>}
                                    </td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{it.hsnCode || '—'}</td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}><strong>{it.qty}</strong></td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{it.rate}</td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{it.uom}</td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{it.taxableAmount}</td>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', verticalAlign: 'top' }}>{isIGST ? it.igstAmount : (it.cgstAmount + it.sgstAmount)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'top', fontWeight: 700 }}>{it.totalAmount}</td>
                                    <td style={{ borderLeft: '1px solid #000' }}></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '1px solid #000' }}>
                                <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>Total Taxable Value</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ borderLeft: '1px solid #000' }}></td>
                            </tr>
                            {inv.freightAmount > 0 && (
                                <tr style={{ borderTop: 'none' }}>
                                    <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>Freight Charges</td>
                                    <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600 }}>{(inv.freightAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style={{ borderLeft: '1px solid #000' }}></td>
                                </tr>
                            )}
                            {gstApplicable && (
                                <tr style={{ borderTop: 'none' }}>
                                    <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>Taxable Amount</td>
                                    <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>{(Number(inv.totalTaxableAmount || 0) + Number(inv.freightAmount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style={{ borderLeft: '1px solid #000' }}></td>
                                </tr>
                            )}
                            {gstApplicable && (
                                <>
                                    {isIGST ? (
                                        <tr style={{ borderTop: 'none' }}>
                                            <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>IGST @ {inv.items?.[0]?.taxPercent || 18}%</td>
                                            <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600 }}>{(inv.totalIgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td style={{ borderLeft: '1px solid #000' }}></td>
                                        </tr>
                                    ) : (
                                        <>
                                            <tr style={{ borderTop: 'none' }}>
                                                <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>CGST @ {(inv.items?.[0]?.taxPercent || 18) / 2}%</td>
                                                <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600 }}>{(inv.totalCgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                <td style={{ borderLeft: '1px solid #000' }}></td>
                                            </tr>
                                            <tr style={{ borderTop: 'none' }}>
                                                <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>SGST @ {(inv.items?.[0]?.taxPercent || 18) / 2}%</td>
                                                <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600 }}>{(inv.totalSgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                <td style={{ borderLeft: '1px solid #000' }}></td>
                                            </tr>
                                        </>
                                    )}
                                </>
                            )}
                            {inv.roundOff !== 0 && (
                                <tr style={{ borderTop: 'none' }}>
                                    <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>Round Off</td>
                                    <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600 }}>{(inv.roundOff || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style={{ borderLeft: '1px solid #000' }}></td>
                                </tr>
                            )}
                            <tr style={{ borderTop: '1px solid #000' }}>
                                <td colSpan={8} style={{ borderRight: '1px solid #000', padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>Invoice Grand Total</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: '14px' }}>{(inv.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ borderLeft: '1px solid #000' }}></td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Footer / Signatures */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginTop: '20px', gap: '20px' }}>
                        <div>
                            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Amount Chargeable (in words):</div>
                            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '16px', textTransform: 'capitalize' }}>{numberToWords(inv.grandTotal)}</div>

                            {inv.bankName && inv.accountNumber && (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, textDecoration: 'underline', marginBottom: '4px' }}>Bank Details:</div>
                                    <div style={{ fontSize: '11px' }}>
                                        <strong>Bank:</strong> {inv.bankName}<br />
                                        <strong>A/c No:</strong> {inv.accountNumber} <br />
                                        <strong>IFSC:</strong> {inv.ifscCode}
                                    </div>
                                </div>
                            )}

                            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', textDecoration: 'underline' }}>Declaration:</div>
                            <div style={{ fontSize: '11px', color: '#333' }}>
                                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Application Header */}
            <div data-no-print style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        {company.logoUrl && (
                            <img src={company.logoUrl} alt="Company Logo" style={{ maxHeight: '60px', maxWidth: '180px', objectFit: 'contain' }} />
                        )}
                        <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{inv.invoiceNumber}</h1>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border} ` }}>{inv.status}</span>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border} ` }}>{livePaymentStatus}</span>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#6b7280', border: '1px solid #e2e8f0' }}>{inv.flowType}</span>
                            </div>
                            <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>Supplier: <strong style={{ color: '#1e293b' }}>{inv.supplierName}</strong> · Date: {fmt(inv.invoiceDate)}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {inv.status !== 'Cancelled' && livePaymentStatus !== 'Paid' && (
                                <button onClick={() => navigate(PATHS.PURCHASE.EDIT_INVOICE(inv._id))}
                                    style={{ padding: '9px 18px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                                    ✎ Edit Invoice
                                </button>
                            )}
                            {inv.status !== 'Cancelled' && livePaymentStatus === 'Unpaid' && (
                                <button
                                    onClick={handleDelete}
                                    style={{ padding: '9px 18px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                                    title="Delete Invoice (Frees Number, Latest Only)"
                                >
                                    🗑 Delete Invoice
                                </button>
                            )}

                            {notCancelled && notFullyPaid && (
                                <button onClick={() => navigate('/accounts/payment-entry', { 
                                    state: { 
                                        source: 'purchase_invoice',
                                        invoiceId: inv._id, 
                                        invoiceNumber: inv.invoiceNumber, 
                                        supplierId: inv.supplierId?._id || inv.supplierId, 
                                        supplierName: inv.supplierName,
                                        amount: inv.grandTotal - inv.paidAmount 
                                    } 
                                })}
                                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                                    💳 Make Payment
                                </button>
                            )}
                            <button onClick={() => window.print()} style={{ padding: '9px 18px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🖨️ Print</button>
                            {notCancelled && notFullyPaid && (
                                <button
                                    onClick={handleCancel}
                                    disabled={cancelling}
                                    style={{ padding: '9px 18px', background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                                    title="Cancel Invoice (Preserves Number)"
                                >
                                    {cancelling ? 'Processing...' : '✕ Cancel Invoice'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Payment progress bar */}
                    {inv.grandTotal > 0 && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                <span>Paid: {fmtCur(livePaidAmount)}</span>
                                <span>Remaining: {fmtCur(inv.grandTotal - livePaidAmount)}</span>
                                <span>Total: {fmtCur(inv.grandTotal)}</span>
                            </div>
                            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (livePaidAmount / inv.grandTotal) * 100)}% `, background: 'linear-gradient(90deg,#0d9488,#2563eb)', borderRadius: 99, transition: 'width 0.4s' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 10, padding: 4, border: '1px solid #e2e8f0', width: 'fit-content' }}>
                    {[['invoice', '🧾 Invoice Details'], ['payments', `💳 Payments(${payments.length})`]].map(([key, label]) => (
                        <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeTab === key ? '#fff' : 'transparent', color: activeTab === key ? '#0d9488' : '#6b7280', boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>{label}</button>
                    ))}
                </div>

                {/* ── INVOICE DETAILS TAB ── */}
                {activeTab === 'invoice' && (<>
                    {/* Supplier / Buyer */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        {[['Supplier', inv.supplierName, inv.supplierGstin, inv.supplierState, inv.supplierStateCode, inv.supplierAddress], ['Buyer', inv.buyerName, inv.buyerGstin, inv.buyerState, inv.buyerStateCode, inv.buyerAddress]].map(([title, name, gstin, state, code, addr]) => (
                            <div key={title} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 10px', fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{title}</h3>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: '#1e293b' }}>{name}</div>
                                {gstin && <div style={{ fontSize: 12, color: '#9ca3af' }}>GSTIN: <span style={{ color: '#374151' }}>{gstin}</span></div>}
                                {state && <div style={{ fontSize: 12, color: '#9ca3af' }}>State: <span style={{ color: '#374151' }}>{state} {code ? `(${code})` : ''}</span></div>}
                                {addr && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{addr}</div>}
                            </div>
                        ))}
                    </div>

                    {/* Ref info */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        {[['GST Type', inv.gstType], ['Place of Supply', inv.placeOfSupply], ['PO Ref', inv.poNumber || '—'], ['PO Date', fmt(inv.poDate)], ['GRN Ref', inv.grnNumber || '—']].map(([k, v]) => (
                            <div key={k}><div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600, marginTop: 2 }}>{v}</div></div>
                        ))}
                    </div>

                    {/* Transport info */}
                    {(inv.transporterName || inv.vehicleNo || inv.lrNumber) && (
                        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #e5e7eb', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            🚚 {inv.transporterName && <span style={{ color: '#9ca3af', fontSize: 13 }}>Transporter: <strong style={{ color: '#374151' }}>{inv.transporterName}</strong></span>}
                            {inv.vehicleNo && <span style={{ color: '#9ca3af', fontSize: 13 }}>Vehicle: <strong style={{ color: '#374151' }}>{inv.vehicleNo}</strong></span>}
                            {inv.lrNumber && <span style={{ color: '#9ca3af', fontSize: 13 }}>LR No: <strong style={{ color: '#374151' }}>{inv.lrNumber}</strong></span>}
                        </div>
                    )}

                    {/* Items */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr>
                                    {['#', 'Item', 'Description', 'HSN', 'UOM', 'Qty', 'Rate', 'Disc%', isIGST ? 'IGST' : 'CGST', isIGST ? '' : 'SGST', 'Taxable', 'Total'].map((h, i) => h !== '' ?
                                        <th key={i} style={{ padding: '9px 12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>{h}</th> : null)}
                                </tr>
                            </thead>
                            <tbody>
                                {inv.items?.map((it, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '9px 12px', color: '#9ca3af' }}>{i + 1}</td>
                                        <td style={{ padding: '9px 12px', fontWeight: 500, color: '#1e293b' }}>{it.itemName}<br /><span style={{ fontSize: 10, color: '#9ca3af' }}>{it.itemCode}</span></td>
                                        <td style={{ padding: '9px 12px', color: '#374151' }}>{it.description || '—'}</td>
                                        <td style={{ padding: '9px 12px', color: '#6b7280' }}>{it.hsnCode || '—'}</td>
                                        <td style={{ padding: '9px 12px', color: '#6b7280' }}>{it.uom}</td>
                                        <td style={{ padding: '9px 12px', color: '#374151' }}>{it.qty}</td>
                                        <td style={{ padding: '9px 12px', color: '#374151' }}>₹{it.rate}</td>
                                        <td style={{ padding: '9px 12px', color: '#6b7280' }}>{it.discountPercent}%</td>
                                        <td style={{ padding: '9px 12px', color: '#2563eb' }}>{isIGST ? `₹${it.igstAmount} (${it.igstRate}%)` : `₹${it.cgstAmount} (${it.cgstRate}%)`}</td>
                                        {!isIGST && <td style={{ padding: '9px 12px', color: '#7c3aed' }}>₹${it.sgstAmount} (${it.sgstRate}%)</td>}
                                        <td style={{ padding: '9px 12px', color: '#6b7280' }}>₹{it.taxableAmount}</td>
                                        <td style={{ padding: '9px 12px', color: '#16a34a', fontWeight: 700 }}>₹{it.totalAmount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Totals */}
                        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ minWidth: '280px' }}>
                                {[
                                    ['Taxable Amount', fmtCur(inv.totalTaxableAmount)],
                                    isIGST ? ['IGST', fmtCur(inv.totalIgst)] : null,
                                    !isIGST ? ['CGST', fmtCur(inv.totalCgst)] : null,
                                    !isIGST ? ['SGST', fmtCur(inv.totalSgst)] : null,
                                    ...(inv.freightAmount > 0 ? [['Freight', fmtCur(inv.freightAmount)]] : []),
                                    inv.roundOff ? ['Round Off', fmtCur(inv.roundOff)] : null,
                                ].filter(Boolean).map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#6b7280' }}>
                                        <span>{k}</span><span>{v}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: '#16a34a' }}>
                                    <span>Grand Total</span><span>{fmtCur(inv.grandTotal)}</span>
                                </div>
                                <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{inv.amountInWords}</div>
                            </div>
                        </div>
                    </div>
                </>)}

                {/* ── PAYMENTS TAB ── */}
                {activeTab === 'payments' && (
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        {payments.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No payments recorded yet.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        {['Date', 'Mode', 'Reference', 'Amount', 'Status', 'By'].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p, i) => {
                                        const ref = p.upiTransactionId || p.transactionId || p.chequeNo || '—';
                                        const statusC = p.paymentStatus === 'Completed' ? '#16a34a' : p.paymentStatus === 'Pending' ? '#d97706' : '#dc2626';
                                        const statusBg = p.paymentStatus === 'Completed' ? '#f0fdf4' : p.paymentStatus === 'Pending' ? '#fffbeb' : '#fef2f2';
                                        return (
                                            <tr key={p._id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '11px 14px', color: '#6b7280' }}>{fmt(p.paymentDate)}</td>
                                                <td style={{ padding: '11px 14px', color: '#374151' }}>
                                                    <span style={{ fontSize: 16, marginRight: 6 }}>{MODE_ICONS[p.paymentMode] || '🔖'}</span>
                                                    <strong>{p.paymentMode}</strong>
                                                    {p.bankName && <span style={{ fontSize: 11, color: '#9ca3af', display: 'block' }}>{p.bankName}</span>}
                                                    {p.upiApp && <span style={{ fontSize: 11, color: '#9ca3af', display: 'block' }}>{p.upiApp}</span>}
                                                </td>
                                                <td style={{ padding: '11px 14px', color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>{ref}</td>
                                                <td style={{ padding: '11px 14px', color: '#16a34a', fontWeight: 700 }}>{fmtCur(p.amountPaid)}</td>
                                                <td style={{ padding: '11px 14px' }}><span style={{ color: statusC, background: statusBg, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 8 }}>{p.paymentStatus}</span></td>
                                                <td style={{ padding: '11px 14px', color: '#9ca3af' }}>{p.createdBy?.name || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                                        <td colSpan={3} style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 700 }}>Total Paid</td>
                                        <td style={{ padding: '12px 14px', color: '#16a34a', fontWeight: 800, fontSize: 15 }}>{fmtCur(payments.filter(p => p.paymentStatus !== 'Failed').reduce((s, p) => s + p.amountPaid, 0))}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>



            {/* Print Styles */}
            <style>{`
                @media print { 
                    @page { margin: 0; size: A4 portrait; }
                    body { background: #fff !important; margin: 0 !important; padding: 0 !important; width: 210mm; height: 297mm; overflow: hidden; }
                    
                    /* Hide everything in the body by default */
                    body * { visibility: hidden; }
                    
                    /* Show only the print-only container and its children */
                    .print-only, .print-only * { visibility: visible !important; }
                    .print-only { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 210mm !important; 
                        height: 297mm !important;
                        max-height: 297mm !important;
                        display: flex !important; 
                        flex-direction: column !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                    }

                    .print-content {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    button, [data-no-print], .no-print, #app-sidebar, #app-header { display: none !important; } 
                    * { color: #000 !important; box-shadow: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    table th { background: #f5f5f5 !important; }
                    
                    /* Prevent breaking critical blocks */
                    .p-header, .p-footer, .p-summary { page-break-inside: avoid !important; }
                    
                    /* Adjust table row height for dense content if needed */
                    table td { padding: 4px 8px !important; }
                }
            `}</style>
        </div>
    );
}
