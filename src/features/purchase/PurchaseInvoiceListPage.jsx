import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseInvoices } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const PAY_COLORS = {
    'Unpaid': { color: '#fb923c', bg: '#1c0e00' },
    'Partially Paid': { color: '#fbbf24', bg: '#1c1000' },
    'Paid': { color: '#6ee7b7', bg: '#052e16' },
    'Cancelled': { color: '#94a3b8', bg: '#1e293b' },
};

export default function PurchaseInvoiceListPage() {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [payFilter, setPayFilter] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        getPurchaseInvoices({ search, paymentStatus: payFilter, limit: 50 })
            .then(d => setInvoices(d.invoices || []))
            .catch(() => toast.error('Failed to load invoices'))
            .finally(() => setLoading(false));
    }, [search, payFilter]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>🧾 Purchase Invoices</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>GST-compliant purchase invoices from suppliers</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.NEW_INVOICE)}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                    + New Invoice
                </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <input placeholder="Search invoice / supplier..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '260px' }} />
                <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
                    style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Payment Status</option>
                    {['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
            </div>

            <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#0f172a' }}>
                            {['Invoice No', 'Date', 'Supplier', 'Supplier Inv No', 'PO Ref', 'GST Type', 'Grand Total', 'Payment', 'Actions'].map(h => (
                                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</td></tr>
                        ) : invoices.length === 0 ? (
                            <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No invoices yet.</td></tr>
                        ) : invoices.map((inv, i) => {
                            const pc = PAY_COLORS[inv.paymentStatus] || PAY_COLORS['Unpaid'];
                            return (
                                <tr key={inv._id} style={{ background: i % 2 === 0 ? '#0f172a' : '#1e293b', borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                                    onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))}>
                                    <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>{inv.invoiceNumber}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{fmt(inv.invoiceDate)}</td>
                                    <td style={{ padding: '12px 14px', color: '#f1f5f9', fontWeight: 500 }}>{inv.supplierName}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{inv.supplierInvoiceNo || '—'}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{inv.poNumber || '—'}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{inv.gstType}</td>
                                    <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>₹{(inv.grandTotal || 0).toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: pc.bg, color: pc.color }}>{inv.paymentStatus}</span>
                                    </td>
                                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                                        <button onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))}
                                            style={{ padding: '5px 10px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                                            View →
                                        </button>
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
