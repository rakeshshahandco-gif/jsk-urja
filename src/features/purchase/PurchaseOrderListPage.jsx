import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseOrders, updatePOStatus } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    'Draft': { color: '#94a3b8', bg: '#1e293b' },
    'Ordered': { color: '#60a5fa', bg: '#1e3a5f' },
    'Partially Received': { color: '#fb923c', bg: '#1c0e00' },
    'Completed': { color: '#6ee7b7', bg: '#052e16' },
    'Cancelled': { color: '#ef4444', bg: '#450a0a' },
};

export default function PurchaseOrderListPage() {
    const navigate = useNavigate();
    const [pos, setPOs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        getPurchaseOrders({ search, status: statusFilter, limit: 50 })
            .then(d => setPOs(d.purchaseOrders || []))
            .catch(() => toast.error('Failed to load orders'))
            .finally(() => setLoading(false));
    }, [search, statusFilter]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>🛒 Purchase Orders</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Manage purchase orders and material receipt</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.NEW_ORDER)}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                    + New Purchase Order
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <input placeholder="Search PO or supplier..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '260px' }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Statuses</option>
                    {['Draft', 'Ordered', 'Partially Received', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
            </div>

            {/* Table */}
            <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#0f172a' }}>
                            {['PO No', 'Date', 'Supplier', 'Items', 'Grand Total', 'Expected Delivery', 'Status', 'Actions'].map(h => (
                                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</td></tr>
                        ) : pos.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No purchase orders found.</td></tr>
                        ) : pos.map((po, i) => {
                            const sc = STATUS_COLORS[po.status] || STATUS_COLORS['Draft'];
                            return (
                                <tr key={po._id} style={{ background: i % 2 === 0 ? '#0f172a' : '#1e293b', borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                                    onClick={() => navigate(PATHS.PURCHASE.ORDER_DETAIL(po._id))}>
                                    <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>{po.poNumber}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{fmt(po.poDate)}</td>
                                    <td style={{ padding: '12px 14px', color: '#f1f5f9', fontWeight: 500 }}>{po.supplierName}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{po.items?.length || 0} items</td>
                                    <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>₹{(po.grandTotal || 0).toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{fmt(po.expectedDeliveryDate)}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>{po.status}</span>
                                    </td>
                                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                                        <button onClick={() => navigate(PATHS.PURCHASE.ORDER_DETAIL(po._id))}
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
