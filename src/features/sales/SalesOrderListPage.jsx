import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSalesOrders, deleteSalesOrder } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    Draft: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
    Confirmed: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Dispatched: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    Invoiced: { color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
    Closed: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};
const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function SalesOrderListPage() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');

    const isMounted = React.useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getSalesOrders({ search, status });
            if (isMounted.current) {
                setOrders(data.salesOrders || []);
                setTotal(data.total || 0);
            }
        } catch { 
            if (isMounted.current) toast.error('Failed to load orders'); 
        } finally { 
            if (isMounted.current) setLoading(false); 
        }
    };

    useEffect(() => { load(); }, [search, status]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    const handleDelete = async (e, soId, soNumber) => {
        e.stopPropagation();
        if (!window.confirm(`Delete Sales Order "${soNumber}"? This cannot be undone.`)) return;
        try {
            await deleteSalesOrder(soId);
            toast.success(`Sales Order ${soNumber} deleted.`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete sales order');
        }
    };

    return (
        <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📋 Sales Orders</h1>
                    <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 13 }}>{total} total orders</p>
                </div>
                <button onClick={() => navigate(PATHS.SALES.NEW_ORDER)}
                    style={{ padding: '9px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New Sales Order
                </button>
            </div>

            {/* Filters */}
            <div style={{ padding: '16px 28px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="Search SO number, customer..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, width: 260, outline: 'none', background: '#fff', color: '#374151' }} />
                <select value={status} onChange={e => setStatus(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                    <option value="">All Status</option>
                    {['Draft', 'Confirmed', 'Dispatched', 'Invoiced', 'Closed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
                {(search || status) && (
                    <button onClick={() => { setSearch(''); setStatus(''); }} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>
                        Clear
                    </button>
                )}
            </div>

            {/* Table */}
            <div style={{ padding: '0 28px 28px' }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    {loading ? (
                        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
                    ) : orders.length === 0 ? (
                        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                            <div>No sales orders found.</div>
                            <button onClick={() => navigate(PATHS.SALES.NEW_ORDER)} style={{ marginTop: 12, padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>
                                Create First Sales Order
                            </button>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['SO Number', 'Date', 'Code', 'Customer', 'State', 'Items', 'Grand Total', 'Payment', 'Status', 'Delivery Date', ''].map(h => (
                                        <th key={h} style={th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(so => {
                                    const sc = STATUS_COLORS[so.status] || STATUS_COLORS.Draft;
                                    return (
                                        <tr key={so._id} style={{ cursor: 'pointer' }}
                                            onClick={() => navigate(PATHS.SALES.ORDER_DETAIL(so._id))}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ ...td, color: '#2563eb', fontWeight: 700 }}>{so.soNumber}</td>
                                            <td style={td}>{fmt(so.soDate)}</td>
                                            <td style={{ ...td, fontWeight: 600, color: '#475569' }}>{so.customerCode || '—'}</td>
                                            <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{so.customerName}</td>
                                            <td style={{ ...td, color: '#6b7280' }}>{so.customerState || '—'}</td>
                                            <td style={{ ...td, color: '#6b7280' }}>{so.items?.length || 0} items</td>
                                            <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(so.roundedTotal || so.grandTotal || 0).toLocaleString('en-IN')}</td>
                                            <td style={td}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                                    background: so.paymentType === 'Cash' ? '#f0fdf4' : '#fffbeb',
                                                    color: so.paymentType === 'Cash' ? '#16a34a' : '#d97706',
                                                    border: `1px solid ${so.paymentType === 'Cash' ? '#86efac' : '#fcd34d'}`
                                                }}>
                                                    {so.paymentType}
                                                </span>
                                            </td>
                                            <td style={td}>
                                                <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{so.status}</span>
                                            </td>
                                            <td style={td}>{fmt(so.deliveryDate)}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                    <button onClick={e => { e.stopPropagation(); navigate(PATHS.SALES.ORDER_DETAIL(so._id)); }}
                                                        style={{ padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', color: '#374151', fontSize: 12, fontWeight: 600 }}>
                                                        View →
                                                    </button>
                                                    <button onClick={e => handleDelete(e, so._id, so.soNumber)}
                                                        style={{ padding: '5px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', color: '#dc2626', fontSize: 13 }}
                                                        title="Delete Sales Order">
                                                        🗑
                                                    </button>
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
