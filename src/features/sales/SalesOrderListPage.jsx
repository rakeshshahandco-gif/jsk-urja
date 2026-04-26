import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSalesOrders, deleteSalesOrder, restoreSalesOrder } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown, MessageSquare } from 'lucide-react';
import CommunicationModal from '@/components/communication/CommunicationModal';
import { sendOrder as sendOrderApi } from '@/services/communicationApi';
import { TableSkeleton } from '@/components/ui/BrandedLoading';


const STATUS_COLORS = {
    Draft: { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
    Confirmed: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    Dispatched: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    Invoiced: { color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
    Closed: { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    Cancelled: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    Completed: { color: '#059669', bg: '#f0fdf4', border: '#86efac' },
};

const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 12, textTransform: 'uppercase', background: '#f9fafb', whiteSpace: 'nowrap' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function SalesOrderListPage() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [viewMode, setViewMode] = useState('active'); // active, archived
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isCommModalOpen, setIsCommModalOpen] = useState(false);

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        getSalesOrders({ search, status: statusFilter, view: viewMode, limit: 100 })
            .then(data => {
                if (isMounted.current) {
                    setOrders(data.salesOrders || []);
                    setTotal(data.total || 0);
                }
            })
            .catch(() => { 
                if (isMounted.current) toast.error('Failed to load orders'); 
            })
            .finally(() => { 
                if (isMounted.current) setLoading(false); 
            });
    }, [search, statusFilter, viewMode]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

    const handleDelete = (e, so) => {
        e.stopPropagation();
        
        // Restriction Guard: Cannot delete if invoiced or closed
        if (so.status === 'Invoiced' || so.status === 'Closed' || so.status === 'Completed') {
            toast.error(
                <div style={{ textAlign: 'center' }}>
                    <strong>Action Restricted</strong><br/>
                    This order is already <b>{so.status}</b>.<br/>
                    Please cancel or archive the linked Invoice first.
                </div>, 
                { duration: 4000, style: { border: '1px solid #fecaca', padding: '12px', color: '#991b1b', background: '#fef2f2' } }
            );
            return;
        }

        const reason = window.prompt(`Please provide a reason to archive Sales Order "${so.soNumber}":`);
        if (reason === null) return;
        
        deleteSalesOrder(so._id, { reason: reason || 'Soft archived' })
            .then(() => {
                toast.success(`Sales Order ${so.soNumber} archived.`);
                load();
            })
            .catch(err => {
                toast.error(err.response?.data?.message || 'Failed to archive sales order');
            });
    };

    const handleRestore = (e, so) => {
        e.stopPropagation();
        restoreSalesOrder(so._id, { reason: 'Restored from list view' })
            .then(() => {
                toast.success(`Sales Order ${so.soNumber} restored.`);
                load();
            })
            .catch(err => {
                toast.error(err.response?.data?.message || 'Failed to restore sales order');
            });
    };

    const handleWhatsApp = (e, so) => {
        e.stopPropagation();
        setSelectedOrder(so);
        setIsCommModalOpen(true);
    };

    const handleSendComm = async (commData) => {
        const payload = { ...commData, id: selectedOrder?._id, type: 'Sales Order' };
        toast.promise(
            sendOrderApi(payload),
            {
                loading: `Sending ${commData.channel}...`,
                success: `✅ ${commData.channel} sent successfully!`,
                error: (err) => err.response?.data?.message || `Failed to send ${commData.channel}.`,
            }
        ).then(() => {
            setIsCommModalOpen(false); // Close only on success
        }).catch(() => {}); // Stay open on error
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>📋 Sales Orders</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>{total} total orders in this view</p>
                </div>
                <button onClick={() => navigate(PATHS.SALES.NEW_ORDER)}
                    style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                    + New Sales Order
                </button>
            </div>

            {/* Visibility Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#e2e8f0', padding: 4, borderRadius: 10, width: 'fit-content' }}>
                <button onClick={() => setViewMode('active')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'active' ? '#fff' : 'transparent', color: viewMode === 'active' ? '#0f172a' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    Active
                </button>
                <button onClick={() => setViewMode('archived')}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === 'archived' ? '#fff' : 'transparent', color: viewMode === 'archived' ? '#dc2626' : '#64748b', transition: 'all 0.2s', boxShadow: viewMode === 'archived' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                    Archived
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search SO number, customer..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: 260 }} />
                
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All Statuses</option>
                    {['Draft', 'Confirmed', 'Dispatched', 'Invoiced', 'Closed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
                
                {viewMode === 'archived' && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5' }}>
                        🛡️ ARCHIVE VIEW
                    </span>
                )}
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {loading ? (
                    <TableSkeleton rows={10} cols={8} />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                {['SO Number', 'Date', 'Customer', 'Items', 'Grand Total', 'Payment', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length === 0 ? (
                                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No {viewMode === 'archived' ? 'archived' : ''} sales orders found.</td></tr>
                            ) : orders.map((so) => {
                            const sc = STATUS_COLORS[so.status] || STATUS_COLORS.Draft;
                            const isDeleted = so.isDeleted;
                            return (
                                <tr key={so._id} style={{ cursor: 'pointer', transition: 'background 0.1s', opacity: isDeleted ? 0.8 : 1, background: isDeleted ? '#fcfcfc' : 'transparent' }}
                                    onClick={() => navigate(PATHS.SALES.ORDER_DETAIL(so._id))}
                                    onMouseEnter={e => e.currentTarget.style.background = isDeleted ? '#fcfcfc' : '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = isDeleted ? '#fcfcfc' : 'transparent'}>
                                    <td style={{ ...td, color: isDeleted ? '#94a3b8' : '#2563eb', fontWeight: 700, textDecoration: isDeleted ? 'line-through' : 'none' }}>
                                        {so.soNumber}
                                    </td>
                                    <td style={td}>{fmt(so.soDate)}</td>
                                    <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{so.customerName}</td>
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
                                        <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{so.status}</span>
                                    </td>
                                    <td style={td} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {!isDeleted ? (
                                                <>
                                                    <button onClick={() => navigate(PATHS.SALES.ORDER_DETAIL(so._id))}
                                                        style={{ padding: '5px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                        View
                                                    </button>
                                                    <button onClick={(e) => handleWhatsApp(e, so)}
                                                        style={{ padding: '5px 8px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                        title="WhatsApp Dispatch">
                                                        <MessageSquare size={14} />
                                                    </button>
                                                    <button onClick={() => handleDelete(e, so)}
                                                        style={{ padding: '5px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                                                        title="Archive Sales Order">
                                                        🗑
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={(e) => handleRestore(e, so)}
                                                    style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                                    ♻ Restore
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

            {selectedOrder && (
                <CommunicationModal 
                    isOpen={isCommModalOpen}
                    onClose={() => setIsCommModalOpen(false)}
                    onSend={handleSendComm}
                    type="Sales Order"
                    data={{
                        recipientName: selectedOrder.customerName,
                        email: selectedOrder.customerEmail,
                        phone: selectedOrder.customerPhone,
                        customerId: selectedOrder.customerId,
                        number: selectedOrder.soNumber,
                        id: selectedOrder._id,
                        items: selectedOrder.items,
                        total: selectedOrder.roundedTotal || selectedOrder.grandTotal
                    }}
                />
            )}


        </div>
    );
}

