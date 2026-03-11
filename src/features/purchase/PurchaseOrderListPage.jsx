import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseOrders, deletePurchaseOrder } from '@/services/purchaseApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    'Draft': { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
    'Ordered': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Partially Received': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Fully Received': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    'Completed': { color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
    'Cancelled': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

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
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#fff', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>🛒 Purchase Orders</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Manage purchase orders and material receipt</p>
                </div>
                <button onClick={() => navigate(PATHS.PURCHASE.NEW_ORDER)}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New Purchase Order
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search PO or supplier..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: 260 }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Statuses</option>
                    {['Draft', 'Ordered', 'Partially Received', 'Fully Received', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['PO No', 'Date', 'Supplier', 'Items', 'Grand Total', 'Expected Delivery', 'Status', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                        ) : pos.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No purchase orders found.</td></tr>
                        ) : pos.map((po) => {
                            const sc = STATUS_COLORS[po.status] || STATUS_COLORS['Draft'];
                            return (
                                <tr key={po._id} style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                                    onClick={() => navigate(PATHS.PURCHASE.ORDER_DETAIL(po._id))}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>{po.poNumber}</td>
                                    <td style={td}>{fmt(po.poDate)}</td>
                                    <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{po.supplierName}</td>
                                    <td style={{ ...td, color: '#6b7280' }}>{po.items?.length || 0} items</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(po.grandTotal || 0).toLocaleString('en-IN')}</td>
                                    <td style={td}>{fmt(po.expectedDeliveryDate)}</td>
                                    <td style={td}>
                                        <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{po.status}</span>
                                    </td>
                                    <td style={td} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => navigate(PATHS.PURCHASE.ORDER_DETAIL(po._id))}
                                                style={{ padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                View
                                            </button>
                                            {po.status !== 'Completed' && po.status !== 'Cancelled' && (
                                                <button onClick={() => navigate(`${PATHS.PURCHASE.ORDERS}/edit/${po._id}`)}
                                                    style={{ padding: '5px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                    ✎
                                                </button>
                                            )}
                                            <button onClick={() => {
                                                if (window.confirm('Are you sure you want to delete this Purchase Order? This action cannot be undone.')) {
                                                    deletePurchaseOrder(po._id).then(() => { toast.success('Deleted'); load(); }).catch(e => toast.error(e.response?.data?.message || 'Failed to delete'));
                                                }
                                            }}
                                                style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                🗑
                                            </button>
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
