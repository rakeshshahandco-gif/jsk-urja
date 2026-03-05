import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseInvoices, deletePurchaseInvoice } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const PAY_COLORS = {
    'Unpaid': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Partially Paid': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Paid': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    'Cancelled': { color: '#6b7280', bg: '#f9fafb', border: '#e2e8f0' },
};
const STATUS_COLORS = {
    'Confirmed': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Cancelled': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    'Draft': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
};

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function PurchaseInvoiceListPage() {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [payFilter, setPayFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        getPurchaseInvoices({ search, paymentStatus: payFilter, status: statusFilter, limit: 50 })
            .then(d => setInvoices(d.invoices || []))
            .catch(() => toast.error('Failed to load invoices'))
            .finally(() => setLoading(false));
    }, [search, payFilter, statusFilter]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>🧾 Purchase Invoices</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>GST-compliant purchase invoices from suppliers</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.NEW_INVOICE)}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New Invoice
                </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search invoice / supplier..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: 260 }} />
                <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Payment Status</option>
                    {['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Statuses</option>
                    {['Draft', 'Confirmed', 'Posted', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['Invoice No', 'Date', 'Supplier', 'PO Ref', 'Grand Total', 'Status', 'Payment', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                        ) : invoices.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No invoices yet.</td></tr>
                        ) : invoices.map((inv) => {
                            const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS['Unpaid'];
                            return (
                                <tr key={inv._id} style={{ cursor: 'pointer' }}
                                    onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>{inv.invoiceNumber}</td>
                                    <td style={td}>{fmt(inv.invoiceDate)}</td>
                                    <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{inv.supplierName}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{inv.poNumber || inv.grnNumber || '—'}</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(inv.grandTotal || 0).toLocaleString('en-IN')}</td>
                                    <td style={td}>
                                        {(() => {
                                            const sc = STATUS_COLORS[inv.status] || STATUS_COLORS['Confirmed'];
                                            return <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{inv.status}</span>
                                        })()}
                                    </td>
                                    <td style={td}>
                                        <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}` }}>{inv.paymentStatus}</span>
                                    </td>
                                    <td style={td} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))}
                                                style={{ padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                View
                                            </button>
                                            {inv.status !== 'Cancelled' && inv.paymentStatus !== 'Paid' && (
                                                <>
                                                    <button onClick={() => navigate(PATHS.PURCHASE.EDIT_INVOICE(inv._id))}
                                                        style={{ padding: '5px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                        ✎
                                                    </button>
                                                    {inv.paymentStatus !== 'Paid' && (
                                                        <button onClick={() => {
                                                            if (window.confirm('Delete this Invoice?')) {
                                                                deletePurchaseInvoice(inv._id).then(() => { toast.success('Deleted'); load(); }).catch(e => toast.error(e.response?.data?.message || 'Failed'));
                                                            }
                                                        }}
                                                            style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                            🗑
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
