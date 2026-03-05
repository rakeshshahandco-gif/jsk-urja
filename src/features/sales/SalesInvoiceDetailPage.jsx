import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getSalesInvoiceById, cancelSalesInvoice, recordSalesPayment } from '@/services/salesApi';
import { getCompanyProfile } from '@/services/settingsApi';
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
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('invoice');
    const [showPayModal, setShowPayModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [payForm, setPayForm] = useState({ amountPaid: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMode: 'Cash', reference: '', remarks: '' });
    const [payingSaving, setPayingSaving] = useState(false);

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

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const handleCancel = async () => {
        if (!window.confirm('Cancel this invoice?')) return;
        setCancelling(true);
        try { await cancelSalesInvoice(id); toast.success('Invoice cancelled'); load(); }
        catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setCancelling(false); }
    };

    const handleRecordPayment = async () => {
        if (!payForm.amountPaid || Number(payForm.amountPaid) <= 0) return toast.error('Enter a valid amount');
        setPayingSaving(true);
        try {
            await recordSalesPayment(id, { ...payForm, amountPaid: Number(payForm.amountPaid) });
            toast.success('Payment recorded!');
            setShowPayModal(false);
            load();
            setActiveTab('payments');
        } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
        finally { setPayingSaving(false); }
    };

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>Loading...</div>;
    if (!inv) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#f8f9fa', minHeight: '100vh' }}>Invoice not found.</div>;

    const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS.Unpaid;
    const isIGST = inv.gstType === 'IGST';
    const notCancelled = inv.status !== 'Cancelled';
    const notFullyPaid = inv.paymentStatus !== 'Paid';

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Print Header (Only visible when printing) */}
            <div className="print-header" style={{ display: 'none', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        {company.logoUrl && (
                            <img src={company.logoUrl} alt="Company Logo" style={{ maxHeight: '60px', maxWidth: '180px', objectFit: 'contain' }} />
                        )}
                        <div>
                            <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800 }}>{company.companyName || 'JSK URJA'}</h1>
                            {company.address && <div style={{ fontSize: '12px', color: '#4b5563', maxWidth: '300px' }}>{company.address}</div>}
                            {(company.city || company.state) && <div style={{ fontSize: '12px', color: '#4b5563' }}>{company.city} {company.state} {company.pincode}</div>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#0f172a', fontWeight: 700 }}>TAX INVOICE</h2>
                        <div style={{ fontSize: '12px', color: '#4b5563' }}><strong>Invoice No:</strong> {inv.invoiceNumber}</div>
                        <div style={{ fontSize: '12px', color: '#4b5563' }}><strong>Date:</strong> {fmt(inv.invoiceDate)}</div>
                        {company.gstNumber && <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}><strong>Our GSTIN:</strong> {company.gstNumber}</div>}
                        {company.panNumber && <div style={{ fontSize: '12px', color: '#4b5563' }}><strong>Our PAN:</strong> {company.panNumber}</div>}
                    </div>
                </div>
            </div>

            {/* Application Header */}
            <div data-no-print style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Sales Invoices</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{inv.invoiceNumber}</h1>
                            <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>{inv.paymentStatus}</span>
                            <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: inv.paymentType === 'Cash' ? '#f0fdf4' : '#fffbeb', color: inv.paymentType === 'Cash' ? '#16a34a' : '#d97706', border: `1px solid ${inv.paymentType === 'Cash' ? '#86efac' : '#fcd34d'}` }}>{inv.paymentType}</span>
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                            {inv.customerName} · {fmt(inv.invoiceDate)}
                            {inv.soNumber && <span> · SO: <strong style={{ color: '#374151' }}>{inv.soNumber}</strong></span>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {notCancelled && notFullyPaid && (
                            <button onClick={() => setShowPayModal(true)} style={{ padding: '9px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>💳 Record Payment</button>
                        )}
                        <button onClick={() => window.print()} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🖨️ Print</button>
                        {notCancelled && notFullyPaid && (
                            <button onClick={handleCancel} disabled={cancelling} style={{ padding: '9px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>✕ Cancel</button>
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

            <div style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 10, padding: 4, border: '1px solid #e2e8f0', width: 'fit-content' }}>
                    {[['invoice', '🧾 Invoice Details'], ['payments', `💳 Payments (${inv.payments?.length || 0})`]].map(([key, label]) => (
                        <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeTab === key ? '#fff' : 'transparent', color: activeTab === key ? '#0d9488' : '#6b7280', boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>{label}</button>
                    ))}
                </div>

                {activeTab === 'invoice' && (<>
                    {/* Billing / Shipping */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        {[['Billed To', inv.customerName, inv.customerGstin, inv.billingState, inv.billingStateCode, inv.billingAddress], ['Shipped To', inv.customerName, inv.shippingGstin, '', '', inv.shippingAddress]].map(([title, name, gstin, state, code, addr]) => (
                            <div key={title} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 10px', fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{title}</h3>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{name}</div>
                                {gstin && <div style={{ fontSize: 12, color: '#9ca3af' }}>GSTIN: <span style={{ color: '#374151' }}>{gstin}</span></div>}
                                {state && <div style={{ fontSize: 12, color: '#9ca3af' }}>State: <span style={{ color: '#374151' }}>{state} {code ? `(${code})` : ''}</span></div>}
                                {addr && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{addr}</div>}
                            </div>
                        ))}
                    </div>

                    {/* Ref Info */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        {[['GST Type', inv.gstType], ['Order Type', inv.orderType || '—'], ['Dispatch Through', inv.dispatchThrough || '—'], ['Buyer PO', inv.buyerOrderNo || '—']].map(([k, v]) => (
                            <div key={k}><div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600, marginTop: 2 }}>{v}</div></div>
                        ))}
                    </div>

                    {/* Items Table */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead><tr>
                                {['#', 'Item', 'HSN', 'Qty', 'Rate', 'Taxable', isIGST ? 'IGST' : 'CGST', isIGST ? '' : 'SGST', 'Total'].map((h, i) => h !== '' ? <th key={i} style={th}>{h}</th> : null)}
                            </tr></thead>
                            <tbody>
                                {inv.items?.map((it, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ ...td, color: '#9ca3af' }}>{i + 1}</td>
                                        <td style={td}><div style={{ fontWeight: 500, color: '#1e293b' }}>{it.itemName}</div>{it.modelNo && <div style={{ fontSize: 11, color: '#9ca3af' }}>Model: {it.modelNo}</div>}</td>
                                        <td style={{ ...td, color: '#6b7280' }}>{it.hsnCode || '—'}</td>
                                        <td style={td}>{it.qty} {it.uom}</td>
                                        <td style={td}>₹{it.rate}</td>
                                        <td style={{ ...td, color: '#6b7280' }}>₹{it.taxableAmount}</td>
                                        <td style={{ ...td, color: '#2563eb' }}>{isIGST ? `₹${it.igstAmount} (${it.igstRate}%)` : `₹${it.cgstAmount} (${it.cgstRate}%)`}</td>
                                        {!isIGST && <td style={{ ...td, color: '#7c3aed' }}>₹{it.sgstAmount} ({it.sgstRate}%)</td>}
                                        <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{it.totalAmount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {/* Totals */}
                        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ minWidth: 280 }}>
                                {[['Total Taxable', fmtCur(inv.totalTaxableAmount)], isIGST ? ['IGST', fmtCur(inv.totalIgst)] : null, !isIGST ? ['CGST', fmtCur(inv.totalCgst)] : null, !isIGST ? ['SGST', fmtCur(inv.totalSgst)] : null, inv.freightAmount > 0 ? ['Freight', fmtCur(inv.freightAmount)] : null, ['Round Off', fmtCur(inv.roundOff)]].filter(Boolean).map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#6b7280' }}><span>{k}</span><span>{v}</span></div>
                                ))}
                                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, color: '#16a34a' }}>
                                    <span>Grand Total</span><span>{fmtCur(inv.roundedTotal || inv.grandTotal)}</span>
                                </div>
                                <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{inv.amountInWords}</div>
                            </div>
                        </div>
                    </div>

                    {/* Terms */}
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 14, fontSize: 12, color: '#92400e', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Terms & Conditions</div>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                            <li>Goods once sold will not be taken back.</li>
                            <li>Transit damage is not our responsibility.</li>
                            <li>All complaints must be raised within 15 days.</li>
                            <li>Subject to Mumbai jurisdiction.</li>
                        </ul>
                    </div>
                </>)}

                {activeTab === 'payments' && (
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        {!inv.payments?.length ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No payments recorded yet.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr>{['Date', 'Mode', 'Reference', 'Amount', 'By'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {inv.payments.map((p, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={td}>{fmt(p.paymentDate)}</td>
                                            <td style={td}>{p.paymentMode}</td>
                                            <td style={{ ...td, color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>{p.reference || '—'}</td>
                                            <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>{fmtCur(p.amountPaid)}</td>
                                            <td style={{ ...td, color: '#9ca3af' }}>{p.recordedBy?.name || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot><tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                                    <td colSpan={3} style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 700 }}>Total Paid</td>
                                    <td style={{ padding: '12px 14px', color: '#16a34a', fontWeight: 800, fontSize: 15 }}>{fmtCur(inv.paidAmount)}</td>
                                    <td />
                                </tr></tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {showPayModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>💳 Record Payment</h2>
                        <p style={{ margin: '0 0 20px', color: '#9ca3af', fontSize: 13 }}>Invoice: {inv.invoiceNumber} · Remaining: {fmtCur((inv.roundedTotal || inv.grandTotal) - inv.paidAmount)}</p>
                        <div style={{ display: 'grid', gap: 12 }}>
                            {[['Amount Paid *', 'amountPaid', 'number'], ['Payment Date', 'paymentDate', 'date'], ['Reference / UTR', 'reference', 'text']].map(([label, key, type]) => (
                                <div key={key}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
                                    <input type={type} value={payForm[key]} onChange={e => setPayForm(p => ({ ...p, [key]: e.target.value }))} style={inp} />
                                </div>
                            ))}
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Payment Mode</label>
                                <select value={payForm.paymentMode} onChange={e => setPayForm(p => ({ ...p, paymentMode: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                                    {['Cash', 'UPI', 'Cheque', 'Net Banking', 'NEFT/RTGS/IMPS', 'Card', 'Other'].map(m => <option key={m}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>Remarks</label>
                                <input value={payForm.remarks} onChange={e => setPayForm(p => ({ ...p, remarks: e.target.value }))} style={inp} />
                            </div>
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowPayModal(false)} style={{ padding: '8px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Cancel</button>
                            <button onClick={handleRecordPayment} disabled={payingSaving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
                                {payingSaving ? 'Saving...' : '✓ Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Styles */}
            <style>{`
                @media print { 
                    @page { margin: 1cm; }
                    body { background: #fff !important; }
                    button, [data-no-print] { display: none !important; } 
                    .print-header { display: block !important; }
                    * { color: #000 !important; box-shadow: none !important; }
                    table th { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
                }
            `}</style>
        </div>
    );
}
