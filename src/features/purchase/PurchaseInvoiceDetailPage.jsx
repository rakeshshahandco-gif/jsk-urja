import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPurchaseInvoiceById, cancelPurchaseInvoice, getPaymentsByInvoice } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import RecordPaymentModal from './RecordPaymentModal';

const STATUS_COLORS = {
    Posted: { color: '#60a5fa', bg: '#1e3a5f' },
    Cancelled: { color: '#f87171', bg: '#1f0d0d' },
    Draft: { color: '#fbbf24', bg: '#1c1000' },
};
const PAY_COLORS = {
    Unpaid: { color: '#f87171', bg: '#1f0d0d' },
    'Partially Paid': { color: '#fbbf24', bg: '#1c1000' },
    Paid: { color: '#6ee7b7', bg: '#052e16' },
    Cancelled: { color: '#94a3b8', bg: '#1e293b' },
};
const MODE_ICONS = { Cash: '💵', UPI: '📱', Cheque: '🏦', 'Net Banking': '🌐', 'NEFT/RTGS/IMPS': '⚡', Card: '💳', Other: '🔖' };

export default function PurchaseInvoiceDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [activeTab, setActiveTab] = useState('invoice'); // invoice | payments

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getPurchaseInvoiceById(id),
            getPaymentsByInvoice(id),
        ]).then(([invData, payData]) => {
            setInv(invData);
            setPayments(Array.isArray(payData) ? payData : []);
        }).catch(() => toast.error('Failed to load invoice'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const handleCancel = async () => {
        if (!window.confirm('Cancel this invoice?')) return;
        setCancelling(true);
        try { await cancelPurchaseInvoice(id); toast.success('Invoice cancelled'); load(); }
        catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
        finally { setCancelling(false); }
    };

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#0f172a', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!inv) return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171', background: '#0f172a', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Invoice not found.</div>;

    const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.Posted;
    const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS.Unpaid;
    const isIGST = inv.gstType === 'IGST';
    const notCancelled = inv.status !== 'Cancelled';
    const notFullyPaid = inv.paymentStatus !== 'Paid';

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter',sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.PURCHASE.INVOICES)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}>← Purchase Invoices</button>

                {/* Header */}
                <div style={{ background: '#1e293b', borderRadius: '14px', padding: '20px 24px', border: '1px solid #334155', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>{inv.invoiceNumber}</h1>
                                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>{inv.status}</span>
                                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: pc.bg, color: pc.color }}>{inv.paymentStatus}</span>
                                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}>{inv.flowType}</span>
                            </div>
                            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>Supplier: <strong style={{ color: '#f1f5f9' }}>{inv.supplierName}</strong> · Date: {fmt(inv.invoiceDate)}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {notCancelled && notFullyPaid && (
                                <button onClick={() => setShowPayModal(true)} style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#10b981,#0d9488)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>💳 Record Payment</button>
                            )}
                            <button onClick={() => window.print()} style={{ padding: '9px 18px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>🖨️ Print</button>
                            {notCancelled && notFullyPaid && (
                                <button onClick={handleCancel} disabled={cancelling} style={{ padding: '9px 18px', background: '#1f0d0d', color: '#f87171', border: '1px solid #f87171', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>✕ Cancel</button>
                            )}
                        </div>
                    </div>

                    {/* Payment progress bar */}
                    {inv.grandTotal > 0 && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                <span>Paid: {fmtCur(inv.paidAmount)}</span>
                                <span>Remaining: {fmtCur(inv.grandTotal - inv.paidAmount)}</span>
                                <span>Total: {fmtCur(inv.grandTotal)}</span>
                            </div>
                            <div style={{ height: '6px', background: '#334155', borderRadius: '99px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, ((inv.paidAmount || 0) / inv.grandTotal) * 100)}%`, background: 'linear-gradient(90deg,#10b981,#3b82f6)', borderRadius: '99px', transition: 'width 0.4s' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#1e293b', borderRadius: '10px', padding: '4px', border: '1px solid #334155', width: 'fit-content' }}>
                    {[['invoice', '🧾 Invoice Details'], ['payments', `💳 Payments (${payments.length})`]].map(([key, label]) => (
                        <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: activeTab === key ? '#3b82f6' : 'transparent', color: activeTab === key ? '#fff' : '#94a3b8' }}>{label}</button>
                    ))}
                </div>

                {/* ── INVOICE DETAILS TAB ── */}
                {activeTab === 'invoice' && (<>
                    {/* Supplier / Buyer */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        {[['Supplier', inv.supplierName, inv.supplierGstin, inv.supplierState, inv.supplierStateCode, inv.supplierAddress], ['Buyer', inv.buyerName, inv.buyerGstin, inv.buyerState, inv.buyerStateCode, inv.buyerAddress]].map(([title, name, gstin, state, code, addr]) => (
                            <div key={title} style={{ background: '#1e293b', borderRadius: '12px', padding: '16px', border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 12px', fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{title}</h3>
                                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{name}</div>
                                {gstin && <div style={{ fontSize: '12px', color: '#64748b' }}>GSTIN: <span style={{ color: '#f1f5f9' }}>{gstin}</span></div>}
                                {state && <div style={{ fontSize: '12px', color: '#64748b' }}>State: <span style={{ color: '#f1f5f9' }}>{state} {code ? `(${code})` : ''}</span></div>}
                                {addr && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{addr}</div>}
                            </div>
                        ))}
                    </div>

                    {/* Ref info */}
                    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '16px', border: '1px solid #334155', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {[['GST Type', inv.gstType], ['Place of Supply', inv.placeOfSupply], ['PO Ref', inv.poNumber || '—'], ['GRN Ref', inv.grnNumber || '—']].map(([k, v]) => (
                            <div key={k}><div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 600, marginTop: '2px' }}>{v}</div></div>
                        ))}
                    </div>

                    {/* Transport info */}
                    {(inv.transporterName || inv.vehicleNo || inv.lrNumber) && (
                        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '14px 16px', border: '1px solid #334155', marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            🚚 {inv.transporterName && <span style={{ color: '#94a3b8', fontSize: '13px' }}>Transporter: <strong style={{ color: '#f1f5f9' }}>{inv.transporterName}</strong></span>}
                            {inv.vehicleNo && <span style={{ color: '#94a3b8', fontSize: '13px' }}>Vehicle: <strong style={{ color: '#f1f5f9' }}>{inv.vehicleNo}</strong></span>}
                            {inv.lrNumber && <span style={{ color: '#94a3b8', fontSize: '13px' }}>LR No: <strong style={{ color: '#f1f5f9' }}>{inv.lrNumber}</strong></span>}
                        </div>
                    )}

                    {/* Items */}
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', marginBottom: '16px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                    {['#', 'Item', 'HSN', 'UOM', 'Qty', 'Rate', 'Disc%', isIGST ? 'IGST' : 'CGST', isIGST ? '' : 'SGST', 'Taxable', 'Total'].map((h, i) => h !== '' ?
                                        <th key={i} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th> : null)}
                                </tr>
                            </thead>
                            <tbody>
                                {inv.items?.map((it, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #1e293b', background: i % 2 ? '#0a1220' : 'transparent' }}>
                                        <td style={{ padding: '10px 12px', color: '#475569' }}>{i + 1}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{it.itemName}<br /><span style={{ fontSize: '10px', color: '#64748b' }}>{it.itemCode}</span></td>
                                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{it.hsnCode || '—'}</td>
                                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{it.uom}</td>
                                        <td style={{ padding: '10px 12px' }}>{it.qty}</td>
                                        <td style={{ padding: '10px 12px' }}>₹{it.rate}</td>
                                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{it.discountPercent}%</td>
                                        <td style={{ padding: '10px 12px', color: '#3b82f6' }}>{isIGST ? `₹${it.igstAmount} (${it.igstRate}%)` : `₹${it.cgstAmount} (${it.cgstRate}%)`}</td>
                                        {!isIGST && <td style={{ padding: '10px 12px', color: '#7c3aed' }}>`₹${it.sgstAmount} (${it.sgstRate}%)`</td>}
                                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>₹{it.taxableAmount}</td>
                                        <td style={{ padding: '10px 12px', color: '#10b981', fontWeight: 700 }}>₹{it.totalAmount}</td>
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
                                    ...(inv.freightAmount > 0 ? [['Freight', fmtCur(inv.freightAmount)], inv.freightTotalGst > 0 ? ['Freight GST', fmtCur(inv.freightTotalGst)] : null] : []),
                                    inv.roundOff ? ['Round Off', fmtCur(inv.roundOff)] : null,
                                ].filter(Boolean).map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#94a3b8' }}>
                                        <span>{k}</span><span>{v}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid #334155', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '18px', color: '#10b981' }}>
                                    <span>Grand Total</span><span>{fmtCur(inv.grandTotal)}</span>
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>{inv.amountInWords}</div>
                            </div>
                        </div>
                    </div>
                </>)}

                {/* ── PAYMENTS TAB ── */}
                {activeTab === 'payments' && (
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        {payments.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No payments recorded yet.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#64748b' }}>
                                        {['Date', 'Mode', 'Reference', 'Amount', 'Status', 'By'].map(h => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '1px solid #334155' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p, i) => {
                                        const ref = p.upiTransactionId || p.transactionId || p.chequeNo || '—';
                                        const statusC = p.paymentStatus === 'Completed' ? '#6ee7b7' : p.paymentStatus === 'Pending' ? '#fbbf24' : '#f87171';
                                        return (
                                            <tr key={p._id} style={{ borderBottom: '1px solid #1e293b', background: i % 2 ? '#0a1220' : 'transparent' }}>
                                                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{fmt(p.paymentDate)}</td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{ fontSize: '16px', marginRight: '6px' }}>{MODE_ICONS[p.paymentMode] || '🔖'}</span>
                                                    <strong>{p.paymentMode}</strong>
                                                    {p.bankName && <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>{p.bankName}</span>}
                                                    {p.upiApp && <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>{p.upiApp}</span>}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px' }}>{ref}</td>
                                                <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>{fmtCur(p.amountPaid)}</td>
                                                <td style={{ padding: '12px 14px' }}><span style={{ color: statusC, fontWeight: 700, fontSize: '12px' }}>{p.paymentStatus}</span></td>
                                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{p.createdBy?.name || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#0f172a' }}>
                                        <td colSpan={3} style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700 }}>Total Paid</td>
                                        <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 800, fontSize: '15px' }}>{fmtCur(payments.filter(p => p.paymentStatus !== 'Failed').reduce((s, p) => s + p.amountPaid, 0))}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {showPayModal && (
                <RecordPaymentModal
                    invoice={inv}
                    onClose={() => setShowPayModal(false)}
                    onSuccess={() => { setShowPayModal(false); load(); setActiveTab('payments'); }}
                />
            )}
        </div>
    );
}
