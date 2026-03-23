import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSalesInvoices, cancelSalesInvoice } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const PAY_COLORS = {
    Unpaid: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Partially Paid': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Paid: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#6b7280', bg: '#f9fafb', border: '#e2e8f0' },
};
const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function SalesInvoiceListPage() {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');
    const [paymentType, setPaymentType] = useState('');
    const [cancellingId, setCancellingId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getSalesInvoices({ search, paymentStatus, paymentType });
            setInvoices(data.invoices || []);
            setTotal(data.total || 0);
        } catch { toast.error('Failed to load invoices'); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [search, paymentStatus, paymentType]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
    const fmtCur = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    const handleCancel = async (e, invId) => {
        e.stopPropagation();
        if (!window.confirm('Cancel this invoice? This action cannot be undone.')) return;
        setCancellingId(invId);
        try {
            await cancelSalesInvoice(invId);
            toast.success('Invoice cancelled');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel invoice');
        } finally {
            setCancellingId(null);
        }
    };

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🧾 Sales Invoices</h1>
                    <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 13 }}>{total} total invoices</p>
                </div>
                <button onClick={() => navigate(PATHS.SALES.NEW_INVOICE)}
                    style={{ padding: '9px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New Invoice
                </button>
            </div>

            <div style={{ padding: '16px 28px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <input placeholder="Search invoice no., customer..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, width: 260, outline: 'none', background: '#fff', color: '#374151' }} />
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' }}>
                    <option value="">All Payment Status</option>
                    {['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={paymentType} onChange={e => setPaymentType(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' }}>
                    <option value="">All Types</option>
                    <option>Cash</option>
                    <option>Credit</option>
                </select>
                {(search || paymentStatus || paymentType) && (
                    <button onClick={() => { setSearch(''); setPaymentStatus(''); setPaymentType(''); }}
                        style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>Clear</button>
                )}
            </div>

            <div style={{ padding: '0 28px 28px' }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    {loading ? (
                        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
                    ) : invoices.length === 0 ? (
                        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                            <div>No invoices found.</div>
                            <button onClick={() => navigate(PATHS.SALES.NEW_INVOICE)} style={{ marginTop: 12, padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>
                                Create First Invoice
                            </button>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Invoice No.', 'Date', 'Customer', 'SO Ref', 'Grand Total', 'Paid', 'Type', 'Payment Status', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {invoices.map(inv => {
                                    const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS.Unpaid;
                                    return (
                                        <tr key={inv._id} style={{ cursor: 'pointer' }}
                                            onClick={() => navigate(PATHS.SALES.INVOICE_DETAIL(inv._id))}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>{inv.invoiceNumber}</td>
                                            <td style={td}>{fmt(inv.invoiceDate)}</td>
                                            <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{inv.customerName}</td>
                                            <td style={{ ...td, color: '#6b7280', fontSize: 12 }}>{inv.soNumber || '—'}</td>
                                            <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>{fmtCur(inv.roundedTotal || inv.grandTotal)}</td>
                                            <td style={{ ...td, color: inv.paidAmount > 0 ? '#16a34a' : '#9ca3af' }}>{fmtCur(inv.paidAmount)}</td>
                                            <td style={td}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                                    background: inv.paymentType === 'Cash' ? '#f0fdf4' : '#fffbeb',
                                                    color: inv.paymentType === 'Cash' ? '#16a34a' : '#d97706',
                                                    border: `1px solid ${inv.paymentType === 'Cash' ? '#86efac' : '#fcd34d'}`
                                                }}>
                                                    {inv.paymentType}
                                                </span>
                                            </td>
                                            <td style={td}>
                                                <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>{inv.paymentStatus}</span>
                                            </td>
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                    <button onClick={e => { e.stopPropagation(); navigate(PATHS.SALES.INVOICE_DETAIL(inv._id)); }}
                                                        style={{ padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', color: '#374151', fontSize: 12, fontWeight: 600 }}>
                                                        View →
                                                    </button>
                                                    {inv.status !== 'Cancelled' && (
                                                        <button
                                                            onClick={e => handleCancel(e, inv._id)}
                                                            disabled={cancellingId === inv._id}
                                                            style={{ padding: '5px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', color: '#dc2626', fontSize: 12, fontWeight: 600 }}
                                                        >
                                                            {cancellingId === inv._id ? '...' : '✕ Cancel'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
